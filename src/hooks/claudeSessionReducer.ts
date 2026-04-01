import type {
  ClaudeConversation,
  ClaudeUIMessage,
  ClaudeToolUse,
  ClaudePermissionRequest,
  ClaudeSessionMessage,
  ClaudeUsage,
  ClaudeAssistantMessage,
  ClaudeResultMessage,
  ClaudeStreamEvent,
  ContentBlock,
  ContentBlockToolUse,
  StreamEventPayload,
  PermissionMode,
} from "@/types/claude";

export type Action =
  | {
      type: "SYSTEM_INIT";
      sessionId: string;
      model?: string;
      permissionMode?: PermissionMode;
      tools?: string[];
      slashCommands?: string[];
    }
  | { type: "STREAM_EVENT"; message: ClaudeStreamEvent }
  | { type: "ASSISTANT_MESSAGE"; message: ClaudeAssistantMessage }
  | { type: "RESULT"; message: ClaudeResultMessage }
  | { type: "PERMISSION_REQUEST"; request: ClaudePermissionRequest }
  | { type: "PERMISSION_RESPONDED" }
  | { type: "USER_MESSAGE"; text: string }
  | { type: "ERROR"; message: string }
  | {
      type: "SUBAGENT_TOOL_CALL";
      parentToolUseId: string;
      toolUse: { id: string; name: string; input: Record<string, unknown> };
    }
  | {
      type: "SUBAGENT_TOOL_RESULT";
      parentToolUseId: string;
      toolUseId: string;
      content: string;
      isError: boolean;
    }
  | { type: "SUBAGENT_COMPLETED"; toolUseId: string }
  | { type: "SUBAGENT_PROGRESS"; toolUseId: string; description: string }
  | { type: "SUBAGENT_TEXT"; parentToolUseId: string; text: string }
  | {
      type: "TOOL_RESULT";
      toolUseId: string;
      content: string;
      isError: boolean;
    }
  | {
      type: "ASK_USER_QUESTION";
      toolUseID: string;
      input: Record<string, unknown>;
    }
  | { type: "QUESTION_ANSWERED" }
  | { type: "SESSION_STATE"; sessionState: "running" | "compacting" | null }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_MODEL"; model: string }
  | { type: "SET_PERMISSION_MODE"; mode: PermissionMode }
  | { type: "LOAD_HISTORY"; sessionId: string; messages: ClaudeUIMessage[] }
  | { type: "RESET" };

export function convertSessionMessages(
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
    .filter(
      (m) => m.textContent || m.thinkingContent || m.toolUses.length > 0,
    );
}

export function makeEmptyConversation(): ClaudeConversation {
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

function extractToolUsesFromContent(content: ContentBlock[]): ClaudeToolUse[] {
  const tools: ClaudeToolUse[] = [];
  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      tools.push({
        id: block.id,
        name: block.name,
        input: block.input ?? {},
        inputJson: JSON.stringify(block.input ?? {}),
        status: block.name === "Agent" ? "running" : "complete",
      });
    }
  }
  return tools;
}

function extractTextFromContent(content: ContentBlock[]): {
  text: string;
  thinking: string;
} {
  let text = "";
  let thinking = "";
  for (const block of content) {
    if (block.type === "text" && block.text) {
      text += block.text;
    } else if (block.type === "thinking" && block.thinking) {
      thinking += block.thinking;
    }
  }
  return { text, thinking };
}

function handleStreamEvent(
  state: ClaudeConversation,
  action: { message: ClaudeStreamEvent },
): ClaudeConversation {
  const event = action.message.event;
  const messages = ensureCurrentAssistant(state.messages);
  const current = { ...messages[messages.length - 1] };

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

function handleAssistantMessage(
  state: ClaudeConversation,
  action: { message: ClaudeAssistantMessage },
): ClaudeConversation {
  const content = action.message.message.content;
  const { text: textContent, thinking: thinkingContent } =
    extractTextFromContent(content);
  const snapshotTools = extractToolUsesFromContent(content);

  let messages = [...state.messages];
  let currentIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      currentIdx = i;
      break;
    }
  }
  if (currentIdx === -1) {
    messages = ensureCurrentAssistant(messages);
    currentIdx = messages.length - 1;
  }
  const current = { ...messages[currentIdx] };

  if (textContent)
    current.textContent =
      (current.textContent ? current.textContent + "\n" : "") + textContent;
  if (thinkingContent)
    current.thinkingContent =
      (current.thinkingContent || "") + thinkingContent;

  for (const newTool of snapshotTools) {
    const existingIdx = current.toolUses.findIndex(
      (t) => t.id === newTool.id,
    );
    if (existingIdx === -1) {
      current.toolUses = [...current.toolUses, newTool];
    } else {
      const existing = current.toolUses[existingIdx];
      const merged = {
        ...newTool,
        status: existing.status,
        subToolUses: existing.subToolUses,
        subContent: existing.subContent,
        progressDescription: existing.progressDescription,
      };
      const updated = [...current.toolUses];
      updated[existingIdx] = merged;
      current.toolUses = updated;
    }
  }

  messages[currentIdx] = current;
  return { ...state, messages };
}

function handleResult(
  state: ClaudeConversation,
  action: { message: ClaudeResultMessage },
): ClaudeConversation {
  const msg = action.message;
  let usage: ClaudeUsage | null = state.usage;

  if (msg.modelUsage) {
    let inputTokens = 0,
      outputTokens = 0,
      cacheRead = 0,
      cacheCreation = 0,
      contextWindow = 0;
    for (const u of Object.values(msg.modelUsage)) {
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
    ? String(msg.errors?.[0] ?? msg.result ?? "Execution failed")
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
    totalCost: msg.total_cost_usd ?? state.totalCost,
    numTurns: msg.num_turns ?? state.numTurns,
    durationMs: msg.duration_ms ?? state.durationMs,
    usage,
    messages,
  };
}

function findLastAssistantMessage(
  state: ClaudeConversation,
): {
  messages: ClaudeUIMessage[];
  current: ClaudeUIMessage;
  index: number;
} | null {
  const messages = [...state.messages];
  const current = messages[messages.length - 1];
  if (!current || current.role !== "assistant") return null;
  return { messages, current: { ...current }, index: messages.length - 1 };
}

function updateToolInMessage(
  toolUses: ClaudeToolUse[],
  toolId: string,
  updater: (tool: ClaudeToolUse) => ClaudeToolUse,
): ClaudeToolUse[] | null {
  const idx = toolUses.findIndex((t) => t.id === toolId);
  if (idx === -1) return null;
  const updated = [...toolUses];
  updated[idx] = updater({ ...toolUses[idx] });
  return updated;
}

function handleSubagentToolCall(
  state: ClaudeConversation,
  action: Extract<Action, { type: "SUBAGENT_TOOL_CALL" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.parentToolUseId,
    (parent) => {
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
      return { ...parent, subToolUses: subTools, status: "running" };
    },
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, status: "streaming", messages };
}

function handleSubagentToolResult(
  state: ClaudeConversation,
  action: Extract<Action, { type: "SUBAGENT_TOOL_RESULT" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.parentToolUseId,
    (parent) => {
      const subTools = [...(parent.subToolUses ?? [])];
      const toolIdx = subTools.findIndex((t) => t.id === action.toolUseId);
      if (toolIdx !== -1) {
        subTools[toolIdx] = {
          ...subTools[toolIdx],
          status: "complete",
          output: action.content,
        };
      }
      return { ...parent, subToolUses: subTools };
    },
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, messages };
}

function handleSubagentCompleted(
  state: ClaudeConversation,
  action: Extract<Action, { type: "SUBAGENT_COMPLETED" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.toolUseId,
    (parent) => ({
      ...parent,
      status: "complete",
      subToolUses: parent.subToolUses?.map((t) =>
        t.status === "running" ? { ...t, status: "complete" as const } : t,
      ),
    }),
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, messages };
}

function handleSubagentProgress(
  state: ClaudeConversation,
  action: Extract<Action, { type: "SUBAGENT_PROGRESS" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.toolUseId,
    (parent) => ({
      ...parent,
      status: "running",
      progressDescription: action.description,
    }),
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, status: "streaming", messages };
}

function handleSubagentText(
  state: ClaudeConversation,
  action: Extract<Action, { type: "SUBAGENT_TEXT" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.parentToolUseId,
    (parent) => ({
      ...parent,
      subContent: (parent.subContent ?? "") + action.text,
    }),
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, messages };
}

function handleToolResult(
  state: ClaudeConversation,
  action: Extract<Action, { type: "TOOL_RESULT" }>,
): ClaudeConversation {
  const found = findLastAssistantMessage(state);
  if (!found) return state;
  const { messages, current, index } = found;

  const updatedToolUses = updateToolInMessage(
    current.toolUses,
    action.toolUseId,
    (tool) => ({
      ...tool,
      status: action.isError ? "error" : "complete",
      output: action.content,
    }),
  );
  if (!updatedToolUses) return state;
  current.toolUses = updatedToolUses;
  messages[index] = current;
  return { ...state, messages };
}

function handleAskUserQuestion(
  state: ClaudeConversation,
  action: Extract<Action, { type: "ASK_USER_QUESTION" }>,
): ClaudeConversation {
  const rawQuestions = Array.isArray(action.input.questions)
    ? action.input.questions
    : [];
  const questions = rawQuestions.map(
    (q: Record<string, unknown>, i: number) => ({
      id: typeof q.header === "string" ? q.header : `q-${i}`,
      header:
        typeof q.header === "string" ? q.header : `Question ${i + 1}`,
      question: typeof q.question === "string" ? q.question : "",
      options: Array.isArray(q.options)
        ? (q.options as Array<Record<string, unknown>>).map((o) => ({
            label: String(o.label ?? ""),
            description:
              typeof o.description === "string" ? o.description : undefined,
          }))
        : [],
      multiSelect:
        typeof q.multiSelect === "boolean" ? q.multiSelect : false,
    }),
  );
  return {
    ...state,
    pendingQuestion: { toolUseID: action.toolUseID, questions },
  };
}

function handleError(
  state: ClaudeConversation,
  action: { message: string },
): ClaudeConversation {
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

export function claudeSessionReducer(
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

    case "STREAM_EVENT":
      return handleStreamEvent(state, action);

    case "ASSISTANT_MESSAGE":
      return handleAssistantMessage(state, action);

    case "RESULT":
      return handleResult(state, action);

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

    case "SUBAGENT_TOOL_CALL":
      return handleSubagentToolCall(state, action);
    case "SUBAGENT_TOOL_RESULT":
      return handleSubagentToolResult(state, action);
    case "SUBAGENT_COMPLETED":
      return handleSubagentCompleted(state, action);
    case "SUBAGENT_PROGRESS":
      return handleSubagentProgress(state, action);
    case "SUBAGENT_TEXT":
      return handleSubagentText(state, action);
    case "TOOL_RESULT":
      return handleToolResult(state, action);
    case "ASK_USER_QUESTION":
      return handleAskUserQuestion(state, action);
    case "QUESTION_ANSWERED":
      return { ...state, pendingQuestion: null };
    case "SESSION_STATE":
      return { ...state, sessionState: action.sessionState };
    case "ERROR":
      return handleError(state, action);
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
