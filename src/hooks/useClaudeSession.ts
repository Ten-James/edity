import { useEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type {
  ClaudeSessionInfo,
  ClaudeSessionMessage,
  ContentBlock,
  ModelUsageEntry,
  PermissionMode,
  StreamEventPayload,
} from "@/types/claude";
import {
  claudeSessionReducer,
  convertSessionMessages,
  makeEmptyConversation,
} from "./claudeSessionReducer";
import type { Action } from "./claudeSessionReducer";

// --- IPC data narrowing helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}

function getStringOrNull(obj: Record<string, unknown>, key: string): string | null {
  return getString(obj, key) ?? null;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function isContentBlock(value: unknown): value is ContentBlock {
  if (!isRecord(value)) return false;
  const { type } = value;
  if (type === "text") return typeof value.text === "string";
  if (type === "thinking") return typeof value.thinking === "string";
  if (type === "tool_use") return typeof value.id === "string" && typeof value.name === "string";
  return false;
}

function getContentBlocks(msg: unknown): ContentBlock[] {
  if (!isRecord(msg)) return [];
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  return content.filter(isContentBlock);
}

function getToolResultBlocks(
  msg: unknown,
): Array<{ type: string; tool_use_id: string; content: string; is_error: boolean }> {
  if (!isRecord(msg)) return [];
  const content = msg.content;
  if (!Array.isArray(content)) return [];

  const results: Array<{ type: string; tool_use_id: string; content: string; is_error: boolean }> = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
    results.push({
      type: "tool_result",
      tool_use_id: block.tool_use_id,
      content: typeof block.content === "string" ? block.content : "",
      is_error: block.is_error === true,
    });
  }
  return results;
}

// --- IPC message dispatch ---

function dispatchIPCMessage(data: unknown, dispatch: React.Dispatch<Action>) {
  if (!isRecord(data)) return;

  const msgType = getString(data, "type");
  if (!msgType) return;

  switch (msgType) {
    case "system":
      dispatchSystemMessage(data, dispatch);
      break;

    case "stream_event":
      dispatchStreamEvent(data, dispatch);
      break;

    case "assistant":
      dispatchAssistantMessage(data, dispatch);
      break;

    case "user":
      dispatchUserMessage(data, dispatch);
      break;

    case "result":
      dispatchResultMessage(data, dispatch);
      break;

    case "ask_user_question":
      dispatchAskUserQuestion(data, dispatch);
      break;

    case "permission_request":
      dispatchPermissionRequest(data, dispatch);
      break;

    case "error":
      dispatch({
        type: "ERROR",
        message: getString(data, "message") ?? "Unknown error",
      });
      break;
  }
}

function dispatchStreamEvent(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const event = raw.event;
  if (!isRecord(event)) return;

  const eventType = getString(event, "type");
  if (!eventType) return;

  // StreamEventPayload is a complex discriminated union from the Claude SDK.
  // The reducer handles each variant with runtime checks. Full validation here
  // would duplicate that logic. We trust the SDK shape at this IPC boundary.
  const streamEvent: StreamEventPayload = event as StreamEventPayload;

  dispatch({
    type: "STREAM_EVENT",
    message: {
      type: "stream_event",
      event: streamEvent,
      parent_tool_use_id: getStringOrNull(raw, "parent_tool_use_id"),
      uuid: getString(raw, "uuid") ?? "",
      session_id: getString(raw, "session_id") ?? "",
    },
  });
}

function dispatchResultMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  // ModelUsageEntry fields are all optional numbers — the reducer handles
  // missing values with ?? 0. We trust the SDK shape for this nested record.
  const modelUsage = isRecord(raw.modelUsage)
    ? (raw.modelUsage as Record<string, ModelUsageEntry>)
    : undefined;
  const errors = Array.isArray(raw.errors) ? raw.errors.map(String) : undefined;

  dispatch({
    type: "RESULT",
    message: {
      type: "result",
      subtype: getString(raw, "subtype") ?? "success",
      result: getString(raw, "result"),
      total_cost_usd: typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : undefined,
      duration_ms: typeof raw.duration_ms === "number" ? raw.duration_ms : undefined,
      num_turns: typeof raw.num_turns === "number" ? raw.num_turns : undefined,
      session_id: getString(raw, "session_id") ?? "",
      modelUsage,
      errors,
    },
  });
}

function dispatchAskUserQuestion(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const toolUseID = getString(raw, "toolUseID");
  if (!toolUseID) return;

  dispatch({
    type: "ASK_USER_QUESTION",
    toolUseID,
    input: isRecord(raw.input) ? raw.input : {},
  });
}

function dispatchPermissionRequest(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const toolUseID = getString(raw, "toolUseID");
  const toolName = getString(raw, "toolName");
  if (!toolUseID || !toolName) return;

  dispatch({
    type: "PERMISSION_REQUEST",
    request: {
      type: "permission_request",
      toolName,
      input: isRecord(raw.input) ? raw.input : {},
      toolUseID,
      title: getString(raw, "title"),
      displayName: getString(raw, "displayName"),
      description: getString(raw, "description"),
    },
  });
}

function dispatchSystemMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const subtype = getString(raw, "subtype");

  if (subtype === "task_progress" || subtype === "task_started") {
    const toolUseId = getString(raw, "tool_use_id");
    const desc = getString(raw, "description");
    if (toolUseId && desc) {
      dispatch({
        type: "SUBAGENT_PROGRESS",
        toolUseId,
        description: desc,
      });
    }
    return;
  }

  if (subtype === "task_notification") {
    const toolUseId = getString(raw, "tool_use_id");
    if (toolUseId) {
      dispatch({ type: "SUBAGENT_COMPLETED", toolUseId });
    }
    return;
  }

  if (subtype === "status") {
    const status = getString(raw, "status");
    dispatch({
      type: "SESSION_STATE",
      sessionState: status === "compacting" ? "compacting" : "running",
    });
    return;
  }

  if (subtype !== "init") return;

  const rawCmds = raw.slash_commands;
  const slashCommands = Array.isArray(rawCmds)
    ? rawCmds.map((c) =>
        typeof c === "string"
          ? c
          : isRecord(c) && typeof c.name === "string"
            ? c.name
            : "",
      ).filter(Boolean)
    : [];

  dispatch({
    type: "SYSTEM_INIT",
    sessionId: getString(raw, "session_id") ?? "",
    model: getString(raw, "model"),
    permissionMode: getPermissionMode(raw.permissionMode),
    tools: getStringArray(raw.tools),
    slashCommands,
  });
}

function getPermissionMode(value: unknown): PermissionMode | undefined {
  if (
    value === "default" ||
    value === "acceptEdits" ||
    value === "bypassPermissions" ||
    value === "plan" ||
    value === "dontAsk"
  ) {
    return value;
  }
  return undefined;
}

function dispatchAssistantMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const parentId = getStringOrNull(raw, "parent_tool_use_id");
  const content = getContentBlocks(raw.message);

  if (parentId) {
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
      message: {
        type: "assistant",
        message: { content },
        uuid: getString(raw, "uuid") ?? "",
        parent_tool_use_id: null,
        session_id: getString(raw, "session_id") ?? "",
      },
    });
  }
}

function dispatchUserMessage(
  raw: Record<string, unknown>,
  dispatch: React.Dispatch<Action>,
) {
  const parentId = getStringOrNull(raw, "parent_tool_use_id");
  const blocks = getToolResultBlocks(raw.message);

  for (const block of blocks) {
    if (parentId) {
      dispatch({
        type: "SUBAGENT_TOOL_RESULT",
        parentToolUseId: parentId,
        toolUseId: block.tool_use_id,
        content: block.content,
        isError: block.is_error,
      });
    } else {
      dispatch({
        type: "TOOL_RESULT",
        toolUseId: block.tool_use_id,
        content: block.content,
        isError: block.is_error,
      });
    }
  }
}

// --- Error handling ---

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// --- Hook ---

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
    // Inline the refresh so projectPath is the only dep — refreshSessions
    // is recreated each render but its body only needs projectPath.
    invoke<ClaudeSessionInfo[]>("claude_list_sessions", { projectPath })
      .then(setSessions)
      .catch(() => {});
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
