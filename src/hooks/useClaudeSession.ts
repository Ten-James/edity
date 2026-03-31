import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type {
  ClaudeMessage,
  ClaudeConversation,
  ClaudeUIMessage,
  ClaudeToolUse,
  ClaudePermissionRequest,
  ClaudeSessionInfo,
  ClaudeSessionMessage,
  ClaudeUsage,
  ContentBlockToolUse,
  StreamEventPayload,
  PermissionMode,
} from "@/types/claude";

type Action =
  | { type: "SYSTEM_INIT"; sessionId: string; model?: string; permissionMode?: PermissionMode; tools?: string[]; slashCommands?: string[] }
  | { type: "STREAM_EVENT"; message: ClaudeMessage & { type: "stream_event" } }
  | { type: "ASSISTANT_MESSAGE"; message: ClaudeMessage & { type: "assistant" } }
  | { type: "RESULT"; message: ClaudeMessage & { type: "result" } }
  | { type: "PERMISSION_REQUEST"; request: ClaudePermissionRequest }
  | { type: "PERMISSION_RESPONDED" }
  | { type: "USER_MESSAGE"; text: string }
  | { type: "ERROR"; message: string }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_MODEL"; model: string }
  | { type: "SET_PERMISSION_MODE"; mode: PermissionMode }
  | { type: "LOAD_HISTORY"; sessionId: string; messages: ClaudeUIMessage[] }
  | { type: "RESET" };

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function convertSessionMessages(messages: ClaudeSessionMessage[]): ClaudeUIMessage[] {
  return messages
    .filter((m) => m.type === "user" || m.type === "assistant")
    .map((m) => {
      const msg = m.message as { content?: string | ContentBlock[] } | undefined;
      const content = msg?.content;

      let textContent = "";
      let thinkingContent = "";
      const toolUses: ClaudeToolUse[] = [];

      if (typeof content === "string") {
        textContent = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            textContent += block.text;
          } else if (block.type === "thinking" && block.thinking) {
            thinkingContent += block.thinking;
          } else if (block.type === "tool_use" && block.id && block.name) {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input ?? {},
              inputJson: JSON.stringify(block.input ?? {}),
              status: "complete",
            });
          }
        }
      }

      return {
        id: m.uuid,
        role: m.type as "user" | "assistant",
        textContent,
        thinkingContent,
        toolUses,
        isStreaming: false,
        timestamp: Date.now(),
      };
    })
    .filter((m) => m.textContent || m.thinkingContent || m.toolUses.length > 0);
}

function makeEmptyConversation(): ClaudeConversation {
  return {
    sessionId: null,
    messages: [],
    status: "idle",
    pendingPermission: null,
    totalCost: 0,
    numTurns: 0,
    durationMs: 0,
    usage: null,
    model: null,
    permissionMode: "default",
    tools: [],
    slashCommands: [],
  };
}

function ensureCurrentAssistant(messages: ClaudeUIMessage[]): ClaudeUIMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && last.isStreaming) return messages;
  return [
    ...messages,
    {
      id: crypto.randomUUID(),
      role: "assistant",
      textContent: "",
      thinkingContent: "",
      toolUses: [],
      isStreaming: true,
      timestamp: Date.now(),
    },
  ];
}

/** Apply tool_use stream events (start/delta/stop) to a tool use array. Returns updated array or null if unhandled. */
function applyToolUseEvent(toolUses: ClaudeToolUse[], event: StreamEventPayload): ClaudeToolUse[] | null {
  if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
    const block = event.content_block as ContentBlockToolUse;
    return [...toolUses, { id: block.id, name: block.name, input: {}, inputJson: "", status: "running" }];
  }
  if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
    const updated = [...toolUses];
    const last = updated[updated.length - 1];
    if (last) {
      updated[updated.length - 1] = { ...last, inputJson: last.inputJson + event.delta.partial_json };
    }
    return updated;
  }
  if (event.type === "content_block_stop") {
    const updated = [...toolUses];
    const last = updated[updated.length - 1];
    if (last && last.inputJson && last.status === "running") {
      try {
        updated[updated.length - 1] = { ...last, input: JSON.parse(last.inputJson) };
      } catch { /* partial JSON */ }
    }
    return updated;
  }
  return null;
}

function reducer(state: ClaudeConversation, action: Action): ClaudeConversation {
  switch (action.type) {
    case "SET_SESSION_ID":
      return { ...state, sessionId: action.sessionId };

    case "SYSTEM_INIT":
      return {
        ...state,
        sessionId: action.sessionId,
        status: "streaming",
        model: action.model ?? state.model,
        permissionMode: action.permissionMode ?? state.permissionMode,
        tools: action.tools ?? state.tools,
        slashCommands: action.slashCommands ?? state.slashCommands,
      };

    case "STREAM_EVENT": {
      const event = action.message.event;
      const parentId = action.message.parent_tool_use_id;
      const messages = ensureCurrentAssistant(state.messages);
      const current = { ...messages[messages.length - 1] };

      // Sub-agent messages: route to parent tool use
      if (parentId) {
        const toolUses = [...current.toolUses];
        const parentIdx = toolUses.findIndex((t) => t.id === parentId);
        if (parentIdx !== -1) {
          const parent = { ...toolUses[parentIdx] };
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            parent.subContent = (parent.subContent ?? "") + event.delta.text;
          } else {
            const updated = applyToolUseEvent(parent.subToolUses ?? [], event);
            if (updated) parent.subToolUses = updated;
          }
          toolUses[parentIdx] = parent;
          current.toolUses = toolUses;
        }

        return {
          ...state,
          status: "streaming",
          messages: [...messages.slice(0, -1), current],
        };
      }

      // Main agent messages: text/thinking deltas go on the message, tool events on toolUses
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          current.textContent += event.delta.text;
        } else if (event.delta.type === "thinking_delta") {
          current.thinkingContent += event.delta.thinking;
        }
      }
      const updatedToolUses = applyToolUseEvent(current.toolUses, event);
      if (updatedToolUses) current.toolUses = updatedToolUses;

      return {
        ...state,
        status: "streaming",
        messages: [...messages.slice(0, -1), current],
      };
    }

    case "ASSISTANT_MESSAGE": {
      const messages = ensureCurrentAssistant(state.messages);
      const current = { ...messages[messages.length - 1] };
      current.isStreaming = false;
      current.toolUses = current.toolUses.map((t) => ({
        ...t,
        status: t.status === "running" ? "complete" as const : t.status,
      }));

      return {
        ...state,
        messages: [...messages.slice(0, -1), current],
      };
    }

    case "RESULT": {
      const msg = action.message as unknown as Record<string, unknown>;
      const modelUsage = msg.modelUsage as Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; contextWindow?: number }> | undefined;
      let usage: ClaudeUsage | null = state.usage;
      if (modelUsage) {
        let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheCreation = 0, contextWindow = 0;
        for (const u of Object.values(modelUsage)) {
          inputTokens += u.inputTokens ?? 0;
          outputTokens += u.outputTokens ?? 0;
          cacheRead += u.cacheReadInputTokens ?? 0;
          cacheCreation += u.cacheCreationInputTokens ?? 0;
          if (u.contextWindow && u.contextWindow > contextWindow) contextWindow = u.contextWindow;
        }
        usage = { inputTokens, outputTokens, cacheReadInputTokens: cacheRead, cacheCreationInputTokens: cacheCreation, contextWindow };
      }
      return {
        ...state,
        status: "idle",
        totalCost: (msg.total_cost_usd as number) ?? state.totalCost,
        numTurns: (msg.num_turns as number) ?? state.numTurns,
        durationMs: (msg.duration_ms as number) ?? state.durationMs,
        usage,
        messages: state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m,
        ),
      };
    }

    case "PERMISSION_REQUEST":
      return {
        ...state,
        status: "waiting_permission",
        pendingPermission: action.request,
      };

    case "PERMISSION_RESPONDED":
      return { ...state, status: "streaming", pendingPermission: null };

    case "USER_MESSAGE":
      return {
        ...state,
        status: "streaming",
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: "user",
            textContent: action.text,
            thinkingContent: "",
            toolUses: [],
            isStreaming: false,
            timestamp: Date.now(),
          },
        ],
      };

    case "ERROR":
      return {
        ...state,
        status: "error",
        messages: state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false, error: action.message } : m,
        ),
      };

    case "SET_MODEL":
      return { ...state, model: action.model };

    case "SET_PERMISSION_MODE":
      return { ...state, permissionMode: action.mode };

    case "LOAD_HISTORY":
      return {
        ...state,
        sessionId: action.sessionId,
        messages: action.messages,
        status: "idle",
      };

    case "RESET":
      return { ...makeEmptyConversation(), model: state.model, permissionMode: state.permissionMode };

    default:
      return state;
  }
}

export function useClaudeSession(projectPath: string) {
  const [conversation, dispatch] = useReducer(reducer, undefined, makeEmptyConversation);
  const sessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<ClaudeSessionInfo[]>([]);

  // Listen for messages from main process
  // Uses a ref + imperative registration so the listener is ready BEFORE sdk.query() fires
  const unlistenRef = useRef<(() => void) | null>(null);

  const setupListener = useCallback((sid: string) => {
    // Clean up previous listener
    unlistenRef.current?.();
    unlistenRef.current = window.electronAPI.on(`claude-msg-${sid}`, (data: unknown) => {
      const payload = data as ClaudeMessage;
      switch (payload.type) {
        case "system": {
          // Only handle init subtype, ignore status/session_state_changed
          const raw = data as Record<string, unknown>;
          if (raw.subtype !== "init") break;
          // slash_commands may be string[] or {name, description}[] - normalize
          const rawCmds = raw.slash_commands as unknown[];
          const slashCommands = Array.isArray(rawCmds)
            ? rawCmds.map((c) => (typeof c === "string" ? c : (c as { name: string }).name))
            : [];
          dispatch({
            type: "SYSTEM_INIT",
            sessionId: payload.session_id,
            model: payload.model,
            permissionMode: payload.permissionMode,
            tools: payload.tools,
            slashCommands,
          });
          break;
        }
        case "stream_event":
          dispatch({ type: "STREAM_EVENT", message: payload });
          break;
        case "assistant":
          dispatch({ type: "ASSISTANT_MESSAGE", message: payload });
          break;
        case "result":
          dispatch({ type: "RESULT", message: payload });
          break;
        case "permission_request":
          dispatch({ type: "PERMISSION_REQUEST", request: payload });
          break;
        case "error":
          dispatch({ type: "ERROR", message: payload.message });
          break;
      }
    });
  }, []);

  const teardownListener = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  const refreshSessions = useCallback(() => {
    invoke<ClaudeSessionInfo[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => {});
  }, [projectPath]);

  // Load sessions on mount + cleanup listener on unmount
  useEffect(() => {
    refreshSessions();
    return () => { teardownListener(); };
  }, [refreshSessions, teardownListener]);

  const startSession = useCallback(
    async (prompt: string) => {
      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      setupListener(sessionId);
      dispatch({ type: "SET_SESSION_ID", sessionId });
      dispatch({ type: "USER_MESSAGE", text: prompt });

      await invoke("claude_start", {
        sessionId,
        projectPath,
        prompt,
        model: conversation.model,
        permissionMode: conversation.permissionMode,
      });
    },
    [projectPath, conversation.model, conversation.permissionMode, setupListener],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "USER_MESSAGE", text: message });

      await invoke("claude_send", {
        sessionId: sid,
        projectPath,
        message,
        model: conversation.model,
        permissionMode: conversation.permissionMode,
      });
    },
    [projectPath, conversation.model, conversation.permissionMode],
  );

  const resumeSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId;
      setupListener(sessionId);
      dispatch({ type: "RESET" });

      const history = await invoke<ClaudeSessionMessage[]>("claude_get_session_messages", {
        sessionId,
        projectPath,
      });
      const messages = convertSessionMessages(history);
      dispatch({ type: "LOAD_HISTORY", sessionId, messages });
    },
    [projectPath, setupListener],
  );

  const respondPermission = useCallback(
    async (toolUseID: string, behavior: "allow" | "deny") => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "PERMISSION_RESPONDED" });
      await invoke("claude_approve", { sessionId: sid, toolUseID, behavior });
    },
    [],
  );

  const interrupt = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await invoke("claude_interrupt", { sessionId: sid });
  }, []);

  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await invoke("claude_abort", { sessionId: sid });
    dispatch({ type: "RESET" });
    sessionIdRef.current = null;
    teardownListener();
  }, [teardownListener]);

  const setModel = useCallback((model: string) => {
    dispatch({ type: "SET_MODEL", model });
  }, []);

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    dispatch({ type: "SET_PERMISSION_MODE", mode });
  }, []);

  return {
    conversation,
    sessions,
    startSession,
    sendMessage,
    resumeSession,
    respondPermission,
    interrupt,
    abort,
    setModel,
    setPermissionMode,
    refreshSessions,
  };
}
