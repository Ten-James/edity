import type { ClaudeToolUse } from "@/types/claude";

/**
 * Extract a human-readable summary string from a tool's input.
 * Used by both ClaudeToolCall (header) and ClaudePermissionPrompt (description).
 */
export function getToolSummary(
  toolName: string,
  input: Record<string, unknown>,
  inputJson?: string,
): string | null {
  const filePath = getFilePath(input) ?? extractPathFromJson(inputJson);

  switch (toolName) {
    case "Bash":
      return input.description
        ? String(input.description)
        : extractStreamingField(inputJson, "description");
    case "Read":
    case "Edit":
    case "Write":
      return filePath;
    case "Glob":
    case "Grep":
      return input.pattern ? String(input.pattern) : null;
    case "WebSearch":
      return input.query ? String(input.query) : null;
    case "WebFetch":
      return input.url ? String(input.url) : null;
    case "Agent":
      return input.description
        ? String(input.description)
        : input.prompt
          ? String(input.prompt).slice(0, 80)
          : extractStreamingField(inputJson, "description");
    case "AskUserQuestion":
      return input.question ? String(input.question).slice(0, 80) : null;
    case "Skill":
      return input.skill
        ? String(input.skill)
        : extractStreamingField(inputJson, "skill");
    case "NotebookEdit":
      return filePath;
    case "LSP":
      return input.command ? String(input.command) : null;
    case "Mcp":
      return input.tool_name
        ? String(input.tool_name)
        : extractStreamingField(inputJson, "tool_name");
    case "ListMcpResources":
      return null;
    case "ReadMcpResource":
      return input.uri
        ? String(input.uri)
        : extractStreamingField(inputJson, "uri");
    case "ToolSearch":
      return input.query
        ? String(input.query)
        : extractStreamingField(inputJson, "query");
    case "EnterPlanMode":
    case "ExitPlanMode":
    case "EnterWorktree":
    case "ExitWorktree":
      return null;
    default:
      return null;
  }
}

/** Extract file_path from tool input, handling both naming conventions. */
export function getFilePath(input: Record<string, unknown>): string | null {
  const raw = input.file_path ?? input.filePath;
  return raw ? String(raw) : null;
}

/**
 * Try to extract a string field from partial inputJson during streaming.
 * Exported for use in ClaudeToolBodies diff rendering.
 */
export function extractJsonField(
  json: string,
  field: string,
): string | null {
  if (!json || !field) return null;
  const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = json.match(regex);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

/** Wrapper for extractJsonField that handles optional inputJson from streaming. */
function extractStreamingField(inputJson: string | undefined, field: string): string | null {
  if (!inputJson) return null;
  return extractJsonField(inputJson, field);
}

function extractPathFromJson(inputJson?: string): string | null {
  return extractStreamingField(inputJson, "file_path");
}

/** Group consecutive inline tools together for compact rendering. */
export function groupToolUses(
  tools: ClaudeToolUse[],
  inlineToolSet: Set<string>,
): ClaudeToolUse[][] {
  const groups: ClaudeToolUse[][] = [];
  for (const tool of tools) {
    const isInline = inlineToolSet.has(tool.name);
    const last = groups[groups.length - 1];
    if (isInline && last && inlineToolSet.has(last[0].name)) {
      last.push(tool);
    } else {
      groups.push([tool]);
    }
  }
  return groups;
}

interface TaskInfo {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
}

/** Extract task list from TaskCreate/TaskUpdate tool uses. */
export function extractTasks(tools: ClaudeToolUse[]): TaskInfo[] {
  const tasks = new Map<string, TaskInfo>();

  for (const tool of tools) {
    if (tool.name === "TaskCreate" && tool.input.subject) {
      const id = tool.id;
      tasks.set(id, {
        id,
        subject: String(tool.input.subject),
        status: "pending",
      });
    }
  }

  const taskList = [...tasks.values()];
  const byIndex = new Map<string, TaskInfo>();
  taskList.forEach((t, i) => byIndex.set(String(i + 1), t));

  for (const tool of tools) {
    if (tool.name === "TaskUpdate" && tool.input.taskId) {
      const target = byIndex.get(String(tool.input.taskId));
      if (target) {
        if (isValidTaskStatus(tool.input.status)) {
          target.status = tool.input.status;
        }
        if (tool.input.subject) target.subject = String(tool.input.subject);
      }
    }
  }

  return taskList.filter((t) => t.status !== "deleted");
}

function isValidTaskStatus(
  value: unknown,
): value is TaskInfo["status"] {
  return (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "deleted"
  );
}
