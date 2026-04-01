import { useEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type {
  ClaudeAssistantMessage,
  ClaudePermissionRequest,
  ClaudeResultMessage,
  ClaudeSessionInfo,
  ClaudeSessionMessage,
  ClaudeStreamEvent,
  ContentBlock,
  PermissionMode,
} from "@/types/claude";
import {
  claudeSessionReducer,
  convertSessionMessages,
  makeEmptyConversation,
} from "./claudeSessionReducer";
import type { Action } from "./claudeSessionReducer";

/**
 * Parse raw IPC data into a typed dispatch call.
 *
 * The IPC bridge delivers `unknown` payloads — this is the single
 * boundary where we narrow the shape and dispatch typed actions.
 */
function dispatchIPCMessage(data: unknown, dispatch: React.Dispatch<Action>) {
  const raw = data as Record<string, unknown>;
  const msgType = raw.type as string;

  switch (msgType) {
    case "system":
      dispatchSystemMessage(raw, dispatch);
      break;

    case "stream_event":
      dispatch({
        type: "STREAM_EVENT",
        message: data as ClaudeStreamEvent,
      });
      break;

    case "assistant":
      dispatchAssistantMessage(raw, data, dispatch);
      break;

    case "user":
      dispatchUserMessage(raw, dispatch);
      break;

    case "result":
      dispatch({
        type: "RESULT",
        message: data as ClaudeResultMessage,
      });
      break;

    case "ask_user_question":
      dispatch({
        type: "ASK_USER_QUESTION",
        toolUseID: raw.toolUseID as string,
        input: raw.input as Record<string, unknown>,
      });
      break;

    case "permission_request":
      dispatch({
        type: "PERMISSION_REQUEST",
        request: data as ClaudePermissionRequest,
      });
      break;

    case "error":
      dispatch({
        type: "ERROR",
        message: (raw.message as string) ?? "Unknown error",
      });
      break;
  }
}

function dispatchSystemMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  if (
    raw.subtype === "task_progress" ||
    raw.subtype === "task_started"
  ) {
    const toolUseId = raw.tool_use_id as string | undefined;
    const desc = raw.description as string | undefined;
    if (toolUseId && desc) {
      dispatch({
        type: "SUBAGENT_PROGRESS",
        toolUseId,
        description: desc,
      });
    }
    return;
  }

  if (raw.subtype === "task_notification") {
    const toolUseId = raw.tool_use_id as string | undefined;
    if (toolUseId) {
      dispatch({ type: "SUBAGENT_COMPLETED", toolUseId });
    }
    return;
  }

  if (raw.subtype === "status") {
    const status = raw.status as string | undefined;
    dispatch({
      type: "SESSION_STATE",
      sessionState: status === "compacting" ? "compacting" : "running",
    });
    return;
  }

  if (raw.subtype !== "init") return;

  // slash_commands may be string[] or {name, description}[] — normalize
  const rawCmds = raw.slash_commands as unknown[];
  const slashCommands = Array.isArray(rawCmds)
    ? rawCmds.map((c) =>
        typeof c === "string"
          ? c
          : (c as { name: string }).name,
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
}

function dispatchAssistantMessage(
  raw: Record<string, unknown>,
  data: unknown,
  dispatch: React.Dispatch<Action>,
) {
  const parentId = raw.parent_tool_use_id as string | null;

  if (parentId) {
    const msg = raw.message as { content?: ContentBlock[] } | undefined;
    const content = msg?.content ?? [];
    let text = "";

    for (const block of content) {
      if (block.type === "tool_use" && block.id && block.name) {
        dispatch({
          type: "SUBAGENT_TOOL_CALL",
          parentToolUseId: parentId,
          toolUse: {
            id: block.id,
            name: block.name,
            input: block.input ?? {},
          },
        });
      } else if (block.type === "text" && block.text) {
        text += block.text;
      }
    }

    if (text) {
      dispatch({
        type: "SUBAGENT_TEXT",
        parentToolUseId: parentId,
        text,
      });
    }
  } else {
    dispatch({
      type: "ASSISTANT_MESSAGE",
      message: data as ClaudeAssistantMessage,
    });
  }
}

function dispatchUserMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const parentId = raw.parent_tool_use_id as string | null;
  const msg = raw.message as
    | { content?: Array<Record<string, unknown>> }
    | undefined;
  const content = msg?.content ?? [];

  for (const block of content) {
    if (block.type !== "tool_result" || !block.tool_use_id) continue;

    if (parentId) {
      dispatch({
        type: "SUBAGENT_TOOL_RESULT",
        parentToolUseId: parentId,
        toolUseId: String(block.tool_use_id),
        content: String(block.content ?? ""),
        isError: block.is_error === true,
      });
    } else {
      dispatch({
        type: "TOOL_RESULT",
        toolUseId: String(block.tool_use_id),
        content: String(block.content ?? ""),
        isError: block.is_error === true,
      });
    }
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useClaudeSession(projectPath: string) {
  const [conversation, dispatch] = useReducer(
    claudeSessionReducer,
    undefined,
    makeEmptyConversation,
  );
  const sessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<ClaudeSessionInfo[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  const setupListener = (sid: string) => {
    unlistenRef.current?.();
    unlistenRef.current = window.electronAPI.on(
      `claude-msg-${sid}`,
      (data: unknown) => dispatchIPCMessage(data, dispatch),
    );
  };

  const teardownListener = () => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  };

  const refreshSessions = () => {
    invoke<ClaudeSessionInfo[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => {});
  };

  useEffect(() => {
    refreshSessions();
    return teardownListener;
  }, [projectPath]);

  const startSession = async (prompt: string) => {
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
      dispatch({ type: "ERROR", message: getErrorMessage(err) });
    }
  };

  const sendMessage = async (message: string) => {
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
      dispatch({ type: "ERROR", message: getErrorMessage(err) });
    }
  };

  const resumeSession = async (sessionId: string) => {
    sessionIdRef.current = sessionId;
    setupListener(sessionId);
    dispatch({ type: "RESET" });

    try {
      const history = await invoke<ClaudeSessionMessage[]>(
        "claude_get_session_messages",
        { sessionId, projectPath },
      );
      const messages = convertSessionMessages(history);
      dispatch({ type: "LOAD_HISTORY", sessionId, messages });
    } catch (err) {
      console.error("[claude] Failed to load session:", err);
      dispatch({
        type: "ERROR",
        message: `Failed to load session: ${getErrorMessage(err)}`,
      });
    }
  };

  const respondPermission = async (
    toolUseID: string,
    behavior: "allow" | "deny",
  ) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    dispatch({ type: "PERMISSION_RESPONDED" });
    try {
      await invoke("claude_approve", {
        sessionId: sid,
        toolUseID,
        behavior,
      });
    } catch (err) {
      console.error("[claude] Permission response failed:", err);
      dispatch({
        type: "ERROR",
        message: `Permission response failed: ${getErrorMessage(err)}`,
      });
    }
  };

  const answerQuestion = async (
    toolUseID: string,
    answers: Record<string, string>,
  ) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    dispatch({ type: "QUESTION_ANSWERED" });
    try {
      await invoke("claude_answer_question", {
        sessionId: sid,
        toolUseID,
        answers,
      });
    } catch (err) {
      console.error("[claude] Answer question failed:", err);
      dispatch({
        type: "ERROR",
        message: `Failed to answer question: ${getErrorMessage(err)}`,
      });
    }
  };

  const interrupt = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    dispatch({ type: "ERROR", message: "Interrupted by user" });
    try {
      await invoke("claude_interrupt", { sessionId: sid });
    } catch (err) {
      console.error("[claude] Interrupt failed:", err);
    }
  };

  const abort = async () => {
    const sid = sessionIdRef.current;
    teardownListener();
    sessionIdRef.current = null;
    dispatch({ type: "RESET" });
    if (sid) {
      try {
        await invoke("claude_abort", { sessionId: sid });
      } catch (err) {
        console.error("[claude] Abort failed:", err);
      }
    }
  };

  const setModel = (model: string) => {
    dispatch({ type: "SET_MODEL", model });
  };

  const setPermissionMode = (mode: PermissionMode) => {
    dispatch({ type: "SET_PERMISSION_MODE", mode });
  };

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
