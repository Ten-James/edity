import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke, listen } from "@/lib/ipc";
import type {
  ClaudeMessage,
  ClaudeConversation,
  ClaudeUIMessage,
  ClaudeToolUse,
  ClaudePermissionRequest,
  ClaudeSessionInfo,
  ContentBlockToolUse,
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
  | { type: "RESET" };

function makeEmptyConversation(): ClaudeConversation {
  return {
    sessionId: null,
    messages: [],
    status: "idle",
    pendingPermission: null,
    totalCost: 0,
    numTurns: 0,
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
      const messages = ensureCurrentAssistant(state.messages);
      const current = { ...messages[messages.length - 1] };

      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          const block = event.content_block as ContentBlockToolUse;
          const toolUse: ClaudeToolUse = {
            id: block.id,
            name: block.name,
            input: {},
            inputJson: "",
            status: "running",
          };
          current.toolUses = [...current.toolUses, toolUse];
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          current.textContent += event.delta.text;
        } else if (event.delta.type === "thinking_delta") {
          current.thinkingContent += event.delta.thinking;
        } else if (event.delta.type === "input_json_delta") {
          const toolUses = [...current.toolUses];
          const last = toolUses[toolUses.length - 1];
          if (last) {
            toolUses[toolUses.length - 1] = {
              ...last,
              inputJson: last.inputJson + event.delta.partial_json,
            };
          }
          current.toolUses = toolUses;
        }
      } else if (event.type === "content_block_stop") {
        const toolUses = [...current.toolUses];
        const last = toolUses[toolUses.length - 1];
        if (last && last.inputJson && last.status === "running") {
          try {
            toolUses[toolUses.length - 1] = {
              ...last,
              input: JSON.parse(last.inputJson),
            };
          } catch {
            // partial JSON, keep as-is
          }
        }
        current.toolUses = toolUses;
      }

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

    case "RESULT":
      return {
        ...state,
        status: "idle",
        totalCost: action.message.total_cost_usd ?? state.totalCost,
        numTurns: action.message.num_turns ?? state.numTurns,
        messages: state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m,
        ),
      };

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
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const cleanup = listen<ClaudeMessage>(`claude-msg-${sid}`, ({ payload }) => {
      switch (payload.type) {
        case "system":
          dispatch({
            type: "SYSTEM_INIT",
            sessionId: payload.session_id,
            model: payload.model,
            permissionMode: payload.permissionMode,
            tools: payload.tools,
            slashCommands: payload.slash_commands,
          });
          break;
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

    return () => {
      cleanup.then((fn) => fn());
    };
  }, [conversation.sessionId]);

  // Load sessions on mount
  useEffect(() => {
    invoke<ClaudeSessionInfo[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => {});
  }, [projectPath]);

  const startSession = useCallback(
    async (prompt: string) => {
      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
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
    [projectPath, conversation.model, conversation.permissionMode],
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
    async (sessionId: string, prompt: string) => {
      sessionIdRef.current = sessionId;
      dispatch({ type: "RESET" });
      dispatch({ type: "SET_SESSION_ID", sessionId });
      dispatch({ type: "USER_MESSAGE", text: prompt });

      await invoke("claude_start", {
        sessionId,
        projectPath,
        prompt,
        model: conversation.model,
        permissionMode: conversation.permissionMode,
        resume: sessionId,
      });
    },
    [projectPath, conversation.model, conversation.permissionMode],
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
  }, []);

  const setModel = useCallback((model: string) => {
    dispatch({ type: "SET_MODEL", model });
  }, []);

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    dispatch({ type: "SET_PERMISSION_MODE", mode });
  }, []);

  const refreshSessions = useCallback(() => {
    invoke<ClaudeSessionInfo[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => {});
  }, [projectPath]);

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
