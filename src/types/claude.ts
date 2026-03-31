// --- Stream event subtypes (from SDK's BetaRawMessageStreamEvent) ---

export interface ContentBlockText {
  type: "text";
  text: string;
}

export interface ContentBlockToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ContentBlockThinking {
  type: "thinking";
  thinking: string;
}

export type ContentBlock = ContentBlockText | ContentBlockToolUse | ContentBlockThinking;

export type ContentDelta =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "thinking_delta"; thinking: string };

export type StreamEventPayload =
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | { type: "content_block_delta"; index: number; delta: ContentDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_start"; message: unknown }
  | { type: "message_delta"; delta: unknown; usage?: unknown }
  | { type: "message_stop" };

// --- Messages from main process to renderer ---

import type { PermissionMode as _PermissionMode, ClaudeSessionInfo as _ClaudeSessionInfo, ClaudeSessionMessage as _ClaudeSessionMessage } from "@shared/types/ipc";
export type PermissionMode = _PermissionMode;
export type ClaudeSessionInfo = _ClaudeSessionInfo;
export type ClaudeSessionMessage = _ClaudeSessionMessage;

export interface ClaudeSystemMessage {
  type: "system";
  subtype: "init";
  session_id: string;
  model?: string;
  permissionMode?: PermissionMode;
  tools?: string[];
  slash_commands?: string[];
}

export interface ClaudeStreamEvent {
  type: "stream_event";
  event: StreamEventPayload;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

export interface ClaudeAssistantMessage {
  type: "assistant";
  message: {
    content: ContentBlock[];
  };
  uuid: string;
  parent_tool_use_id: string | null;
  session_id: string;
}

export interface ClaudeResultMessage {
  type: "result";
  subtype: "success" | "error_during_execution" | "error_max_turns" | string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  session_id: string;
}

export interface ClaudePermissionRequest {
  type: "permission_request";
  toolName: string;
  input: Record<string, unknown>;
  toolUseID: string;
  title?: string;
  displayName?: string;
  description?: string;
}

export interface ClaudeErrorMessage {
  type: "error";
  message: string;
}

export type ClaudeMessage =
  | ClaudeSystemMessage
  | ClaudeStreamEvent
  | ClaudeAssistantMessage
  | ClaudeResultMessage
  | ClaudePermissionRequest
  | ClaudeErrorMessage;

// --- Renderer-side UI model ---

export type ClaudeSessionStatus =
  | "idle"
  | "streaming"
  | "waiting_permission"
  | "error";

export interface ClaudeToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  inputJson: string;
  output?: string;
  status: "pending" | "running" | "complete" | "error";
  subContent?: string;
  subToolUses?: ClaudeToolUse[];
}

export interface ClaudeUIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  textContent: string;
  thinkingContent: string;
  toolUses: ClaudeToolUse[];
  isStreaming: boolean;
  timestamp: number;
  error?: string;
}

export interface ClaudeConversation {
  sessionId: string | null;
  messages: ClaudeUIMessage[];
  status: ClaudeSessionStatus;
  pendingPermission: ClaudePermissionRequest | null;
  totalCost: number;
  numTurns: number;
  model: string | null;
  permissionMode: PermissionMode;
  tools: string[];
  slashCommands: string[];
}

