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
  | {
      type: "SYSTEM_INIT";
      sessionId: string;
      model?: string;
      permissionMode?: PermissionMode;
      tools?: string[];
      slashCommands?: string[];
    }
  | { type: "STREAM_EVENT"; message: ClaudeMessage & { type: "stream_event" } }
  | {
      type: "ASSISTANT_MESSAGE";
      message: ClaudeMessage & { type: "assistant" };
    }
  | { type: "RESULT"; message: ClaudeMessage & { type: "result" } }
  | { type: "PERMISSION_REQUEST"; request: ClaudePermissionRequest }
  | { type: "PERMISSION_RESPONDED" }
  | { type: "USER_MESSAGE"; text: string }
  | { type: "ERROR"; message: string }
  | { type: "SUBAGENT_TOOL_CALL"; parentToolUseId: string; toolUse: { id: string; name: string; input: Record<string, unknown> } }
  | { type: "SUBAGENT_TOOL_RESULT"; parentToolUseId: string; toolUseId: string; content: string; isError: boolean }
  | { type: "SUBAGENT_COMPLETED"; toolUseId: string }
  | { type: "SUBAGENT_PROGRESS"; toolUseId: string; description: string }
  | { type: "SUBAGENT_TEXT"; parentToolUseId: string; text: string }
  | { type: "TOOL_RESULT"; toolUseId: string; content: string; isError: boolean }
  | { type: "ASK_USER_QUESTION"; toolUseID: string; input: Record<string, unknown> }
  | { type: "QUESTION_ANSWERED" }
  | { type: "SESSION_STATE"; sessionState: "running" | "compacting" | null }
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

function convertSessionMessages(
  messages: ClaudeSessionMessage[],
): ClaudeUIMessage[] {
  return messages
    .filter((m) => m.type === "user" || m.type === "assistant")
    .map((m) => {
      const msg = m.message as
        | { content?: string | ContentBlock[] }
        | undefined;
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
    pendingQuestion: null,
    sessionState: null,
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

function ensureCurrentAssistant(
  messages: ClaudeUIMessage[],
): ClaudeUIMessage[] {
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
function applyToolUseEvent(
  toolUses: ClaudeToolUse[],
  event: StreamEventPayload,
): ClaudeToolUse[] | null {
  if (
    event.type === "content_block_start" &&
    event.content_block.type === "tool_use"
  ) {
    const block = event.content_block as ContentBlockToolUse;
    return [
      ...toolUses,
      {
        id: block.id,
        name: block.name,
        input: {},
        inputJson: "",
        status: "running",
      },
    ];
  }
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "input_json_delta"
  ) {
    const updated = [...toolUses];
    const last = updated[updated.length - 1];
    if (last) {
      updated[updated.length - 1] = {
        ...last,
        inputJson: last.inputJson + event.delta.partial_json,
      };
    }
    return updated;
  }
  if (event.type === "content_block_stop") {
    const updated = [...toolUses];
    const last = updated[updated.length - 1];
    if (last && last.inputJson && last.status === "running") {
      try {
        updated[updated.length - 1] = {
          ...last,
          input: JSON.parse(last.inputJson),
        };
      } catch {
        /* partial JSON */
      }
    }
    return updated;
  }
  return null;
}

function reducer(
  state: ClaudeConversation,
  action: Action,
): ClaudeConversation {
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
        // Agent tools stay "running" until SUBAGENT_COMPLETED
        status: t.status === "running" && t.name !== "Agent" ? ("complete" as const) : t.status,
      }));

      return {
        ...state,
        messages: [...messages.slice(0, -1), current],
      };
    }

    case "RESULT": {
      const msg = action.message as unknown as Record<string, unknown>;
      const modelUsage = msg.modelUsage as
        | Record<
            string,
            {
              inputTokens?: number;
              outputTokens?: number;
              cacheReadInputTokens?: number;
              cacheCreationInputTokens?: number;
              contextWindow?: number;
            }
          >
        | undefined;
      let usage: ClaudeUsage | null = state.usage;
      if (modelUsage) {
        let inputTokens = 0,
          outputTokens = 0,
          cacheRead = 0,
          cacheCreation = 0,
          contextWindow = 0;
        for (const u of Object.values(modelUsage)) {
          inputTokens += u.inputTokens ?? 0;
          outputTokens += u.outputTokens ?? 0;
          cacheRead += u.cacheReadInputTokens ?? 0;
          cacheCreation += u.cacheCreationInputTokens ?? 0;
          if (u.contextWindow && u.contextWindow > contextWindow)
            contextWindow = u.contextWindow;
        }
        usage = {
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreation,
          contextWindow,
        };
      }
      const isError = msg.subtype !== undefined && msg.subtype !== "success";
      const errorMsg = isError
        ? String((msg.errors as string[] | undefined)?.[0] ?? (msg.result as string | undefined) ?? "Execution failed")
        : undefined;

      let messages = state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m,
      );
      if (isError && errorMsg) {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            textContent: "",
            thinkingContent: "",
            toolUses: [],
            isStreaming: false,
            error: errorMsg,
            timestamp: Date.now(),
          },
        ];
      }

      return {
        ...state,
        status: isError ? "error" : "idle",
        pendingPermission: null,
        pendingQuestion: null,
        sessionState: null,
        totalCost: (msg.total_cost_usd as number) ?? state.totalCost,
        numTurns: (msg.num_turns as number) ?? state.numTurns,
        durationMs: (msg.duration_ms as number) ?? state.durationMs,
        usage,
        messages,
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

    case "SUBAGENT_TOOL_CALL": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const parentIdx = toolUses.findIndex((t) => t.id === action.parentToolUseId);
      if (parentIdx === -1) return state;
      const parent = { ...toolUses[parentIdx] };
      const subTools = [...(parent.subToolUses ?? [])];
      const existing = subTools.findIndex((t) => t.id === action.toolUse.id);
      if (existing === -1) {
        subTools.push({
          id: action.toolUse.id,
          name: action.toolUse.name,
          input: action.toolUse.input,
          inputJson: JSON.stringify(action.toolUse.input),
          status: "running",
        });
      }
      parent.subToolUses = subTools;
      parent.status = "running";
      toolUses[parentIdx] = parent;
      updated.toolUses = toolUses;
      messages[messages.length - 1] = updated;
      return { ...state, status: "streaming", messages };
    }

    case "SUBAGENT_TOOL_RESULT": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const parentIdx = toolUses.findIndex((t) => t.id === action.parentToolUseId);
      if (parentIdx === -1) return state;
      const parent = { ...toolUses[parentIdx] };
      const subTools = [...(parent.subToolUses ?? [])];
      const toolIdx = subTools.findIndex((t) => t.id === action.toolUseId);
      if (toolIdx !== -1) {
        subTools[toolIdx] = { ...subTools[toolIdx], status: "complete", output: action.content };
      }
      parent.subToolUses = subTools;
      toolUses[parentIdx] = parent;
      updated.toolUses = toolUses;
      messages[messages.length - 1] = updated;
      return { ...state, messages };
    }

    case "SUBAGENT_COMPLETED": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const parentIdx = toolUses.findIndex((t) => t.id === action.toolUseId);
      if (parentIdx !== -1) {
        const parent = { ...toolUses[parentIdx] };
        parent.status = "complete";
        // Mark all remaining running sub-tools as complete
        if (parent.subToolUses) {
          parent.subToolUses = parent.subToolUses.map((t) =>
            t.status === "running" ? { ...t, status: "complete" as const } : t,
          );
        }
        toolUses[parentIdx] = parent;
      }
      updated.toolUses = toolUses;
      messages[messages.length - 1] = updated;
      return { ...state, messages };
    }

    case "SUBAGENT_PROGRESS": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const parentIdx = toolUses.findIndex((t) => t.id === action.toolUseId);
      if (parentIdx === -1) return state;
      const parent = { ...toolUses[parentIdx] };
      parent.status = "running";
      parent.progressDescription = action.description;
      toolUses[parentIdx] = parent;
      updated.toolUses = toolUses;
      messages[messages.length - 1] = updated;
      return { ...state, status: "streaming", messages };
    }

    case "SUBAGENT_TEXT": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const parentIdx = toolUses.findIndex((t) => t.id === action.parentToolUseId);
      if (parentIdx === -1) return state;
      const parent = { ...toolUses[parentIdx] };
      parent.subContent = (parent.subContent ?? "") + action.text;
      toolUses[parentIdx] = parent;
      updated.toolUses = toolUses;
      messages[messages.length - 1] = updated;
      return { ...state, messages };
    }

    case "TOOL_RESULT": {
      const messages = [...state.messages];
      const current = messages[messages.length - 1];
      if (!current || current.role !== "assistant") return state;
      const updated = { ...current };
      const toolUses = [...updated.toolUses];
      const idx = toolUses.findIndex((t) => t.id === action.toolUseId);
      if (idx !== -1) {
        toolUses[idx] = {
          ...toolUses[idx],
          status: action.isError ? "error" : "complete",
          output: action.content,
        };
        updated.toolUses = toolUses;
        messages[messages.length - 1] = updated;
      }
      return { ...state, messages };
    }

    case "ASK_USER_QUESTION": {
      const rawQuestions = Array.isArray(action.input.questions) ? action.input.questions : [];
      const questions = rawQuestions.map((q: Record<string, unknown>, i: number) => ({
        id: typeof q.header === "string" ? q.header : `q-${i}`,
        header: typeof q.header === "string" ? q.header : `Question ${i + 1}`,
        question: typeof q.question === "string" ? q.question : "",
        options: Array.isArray(q.options)
          ? (q.options as Array<Record<string, unknown>>).map((o) => ({
              label: String(o.label ?? ""),
              description: typeof o.description === "string" ? o.description : undefined,
            }))
          : [],
        multiSelect: typeof q.multiSelect === "boolean" ? q.multiSelect : false,
      }));
      return {
        ...state,
        pendingQuestion: { toolUseID: action.toolUseID, questions },
      };
    }

    case "QUESTION_ANSWERED":
      return { ...state, pendingQuestion: null };

    case "SESSION_STATE":
      return { ...state, sessionState: action.sessionState };

    case "ERROR": {
      const hasStreaming = state.messages.some((m) => m.isStreaming);
      const base = {
        status: "error" as const,
        pendingPermission: null,
        pendingQuestion: null,
        sessionState: null,
      };
      if (hasStreaming) {
        return {
          ...state,
          ...base,
          messages: state.messages.map((m) =>
            m.isStreaming
              ? { ...m, isStreaming: false, error: action.message }
              : m,
          ),
        };
      }
      return {
        ...state,
        ...base,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            textContent: "",
            thinkingContent: "",
            toolUses: [],
            isStreaming: false,
            error: action.message,
            timestamp: Date.now(),
          },
        ],
      };
    }

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
      return {
        ...makeEmptyConversation(),
        model: state.model,
        permissionMode: state.permissionMode,
      };

    default:
      return state;
  }
}

export function useClaudeSession(projectPath: string) {
  const [conversation, dispatch] = useReducer(
    reducer,
    undefined,
    makeEmptyConversation,
  );
  const sessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<ClaudeSessionInfo[]>([]);

  // Listen for messages from main process
  // Uses a ref + imperative registration so the listener is ready BEFORE sdk.query() fires
  const unlistenRef = useRef<(() => void) | null>(null);

  const setupListener = useCallback((sid: string) => {
    // Clean up previous listener
    unlistenRef.current?.();
    unlistenRef.current = window.electronAPI.on(
      `claude-msg-${sid}`,
      (data: unknown) => {
        const raw = data as Record<string, unknown>;
        const msgType = raw.type as string;
        switch (msgType) {
          case "system": {
            // Handle sub-agent lifecycle
            if (raw.subtype === "task_progress" || raw.subtype === "task_started") {
              const toolUseId = raw.tool_use_id as string | undefined;
              const desc = raw.description as string | undefined;
              if (toolUseId && desc) {
                dispatch({ type: "SUBAGENT_PROGRESS", toolUseId, description: desc });
              }
              break;
            }
            if (raw.subtype === "task_notification") {
              const toolUseId = raw.tool_use_id as string | undefined;
              if (toolUseId) {
                dispatch({ type: "SUBAGENT_COMPLETED", toolUseId });
              }
              break;
            }
            if (raw.subtype === "status") {
              const status = raw.status as string | undefined;
              dispatch({
                type: "SESSION_STATE",
                sessionState: status === "compacting" ? "compacting" : "running",
              });
              break;
            }
            if (raw.subtype !== "init") break;
            // slash_commands may be string[] or {name, description}[] - normalize
            const rawCmds = raw.slash_commands as unknown[];
            const slashCommands = Array.isArray(rawCmds)
              ? rawCmds.map((c) =>
                  typeof c === "string" ? c : (c as { name: string }).name,
                )
              : [];
            dispatch({
              type: "SYSTEM_INIT",
              sessionId: raw.session_id as string,
              model: raw.model as string | undefined,
              permissionMode: raw.permissionMode as PermissionMode | undefined,
              tools: raw.tools as string[] | undefined,
              slashCommands,
            });
            break;
          }
          case "stream_event":
            dispatch({ type: "STREAM_EVENT", message: data as ClaudeMessage & { type: "stream_event" } });
            break;
          case "assistant": {
            const parentId = raw.parent_tool_use_id as string | null;
            if (parentId) {
              // Sub-agent assistant message — extract tool_use and text blocks
              const msg = raw.message as Record<string, unknown> | undefined;
              const content = (msg?.content ?? []) as ContentBlock[];
              let text = "";
              for (const block of content) {
                if (block.type === "tool_use" && block.id && block.name) {
                  dispatch({
                    type: "SUBAGENT_TOOL_CALL",
                    parentToolUseId: parentId,
                    toolUse: { id: block.id, name: block.name, input: block.input ?? {} },
                  });
                } else if (block.type === "text" && block.text) {
                  text += block.text;
                }
              }
              if (text) {
                dispatch({ type: "SUBAGENT_TEXT", parentToolUseId: parentId, text });
              }
            } else {
              dispatch({ type: "ASSISTANT_MESSAGE", message: data as ClaudeMessage & { type: "assistant" } });
            }
            break;
          }
          case "user": {
            const parentId = raw.parent_tool_use_id as string | null;
            const msg = raw.message as Record<string, unknown> | undefined;
            const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
            if (parentId) {
              // Sub-agent tool results
              for (const block of content) {
                if (block.type === "tool_result" && block.tool_use_id) {
                  dispatch({
                    type: "SUBAGENT_TOOL_RESULT",
                    parentToolUseId: parentId,
                    toolUseId: String(block.tool_use_id),
                    content: String(block.content ?? ""),
                    isError: block.is_error === true,
                  });
                }
              }
            } else {
              // Main agent tool results
              for (const block of content) {
                if (block.type === "tool_result" && block.tool_use_id) {
                  dispatch({
                    type: "TOOL_RESULT",
                    toolUseId: String(block.tool_use_id),
                    content: String(block.content ?? ""),
                    isError: block.is_error === true,
                  });
                }
              }
            }
            break;
          }
          case "result":
            dispatch({ type: "RESULT", message: data as ClaudeMessage & { type: "result" } });
            break;
          case "ask_user_question":
            dispatch({
              type: "ASK_USER_QUESTION",
              toolUseID: raw.toolUseID as string,
              input: raw.input as Record<string, unknown>,
            });
            break;
          case "permission_request":
            dispatch({ type: "PERMISSION_REQUEST", request: data as ClaudePermissionRequest });
            break;
          case "error":
            dispatch({ type: "ERROR", message: (raw.message as string) ?? "Unknown error" });
            break;
        }
      },
    );
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
    return () => {
      teardownListener();
    };
  }, [refreshSessions, teardownListener]);

  const startSession = useCallback(
    async (prompt: string) => {
      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      setupListener(sessionId);
      dispatch({ type: "SET_SESSION_ID", sessionId });
      dispatch({ type: "USER_MESSAGE", text: prompt });

      try {
        await invoke("claude_start", {
          sessionId,
          projectPath,
          prompt,
          model: conversation.model,
          permissionMode: conversation.permissionMode,
        });
      } catch (err) {
        console.error("[claude] Failed to start session:", err);
        dispatch({ type: "ERROR", message: (err as Error).message || String(err) });
      }
    },
    [
      projectPath,
      conversation.model,
      conversation.permissionMode,
      setupListener,
    ],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "USER_MESSAGE", text: message });

      try {
        await invoke("claude_send", {
          sessionId: sid,
          projectPath,
          message,
          model: conversation.model,
          permissionMode: conversation.permissionMode,
        });
      } catch (err) {
        console.error("[claude] Failed to send message:", err);
        dispatch({ type: "ERROR", message: (err as Error).message || String(err) });
      }
    },
    [projectPath, conversation.model, conversation.permissionMode],
  );

  const resumeSession = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId;
      setupListener(sessionId);
      dispatch({ type: "RESET" });

      try {
        const history = await invoke<ClaudeSessionMessage[]>(
          "claude_get_session_messages",
          {
            sessionId,
            projectPath,
          },
        );
        const messages = convertSessionMessages(history);
        dispatch({ type: "LOAD_HISTORY", sessionId, messages });
      } catch (err) {
        console.error("[claude] Failed to load session:", err);
        dispatch({ type: "ERROR", message: `Failed to load session: ${(err as Error).message || err}` });
      }
    },
    [projectPath, setupListener],
  );

  const respondPermission = useCallback(
    async (toolUseID: string, behavior: "allow" | "deny") => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "PERMISSION_RESPONDED" });
      try {
        await invoke("claude_approve", { sessionId: sid, toolUseID, behavior });
      } catch (err) {
        console.error("[claude] Permission response failed:", err);
        dispatch({ type: "ERROR", message: `Permission response failed: ${(err as Error).message || err}` });
      }
    },
    [],
  );

  const answerQuestion = useCallback(
    async (toolUseID: string, answers: Record<string, string>) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "QUESTION_ANSWERED" });
      try {
        await invoke("claude_answer_question", { sessionId: sid, toolUseID, answers });
      } catch (err) {
        console.error("[claude] Answer question failed:", err);
        dispatch({ type: "ERROR", message: `Failed to answer question: ${(err as Error).message || err}` });
      }
    },
    [],
  );

  const interrupt = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await invoke("claude_interrupt", { sessionId: sid });
    } catch (err) {
      console.error("[claude] Interrupt failed:", err);
    }
  }, []);

  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await invoke("claude_abort", { sessionId: sid });
    } catch (err) {
      console.error("[claude] Abort failed:", err);
    }
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
    answerQuestion,
    interrupt,
    abort,
    setModel,
    setPermissionMode,
    refreshSessions,
  };
}
