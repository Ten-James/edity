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
        : extractFieldFromJson(inputJson, "description");
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
          : extractFieldFromJson(inputJson, "description");
    case "AskUserQuestion":
      return input.question ? String(input.question).slice(0, 80) : null;
    case "Skill":
      return input.skill
        ? String(input.skill)
        : extractFieldFromJson(inputJson, "skill");
    case "NotebookEdit":
      return filePath;
    case "LSP":
      return input.command ? String(input.command) : null;
    case "Mcp":
      return input.tool_name
        ? String(input.tool_name)
        : extractFieldFromJson(inputJson, "tool_name");
    case "ListMcpResources":
      return null;
    case "ReadMcpResource":
      return input.uri
        ? String(input.uri)
        : extractFieldFromJson(inputJson, "uri");
    case "ToolSearch":
      return input.query
        ? String(input.query)
        : extractFieldFromJson(inputJson, "query");
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

/** Try to extract a string field from partial inputJson during streaming. */
function extractFieldFromJson(
  inputJson?: string,
  field?: string,
): string | null {
  if (!inputJson || !field) return null;
  const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`);
  const match = inputJson.match(regex);
  return match?.[1] ?? null;
}

/** Try to extract file_path from partial inputJson during streaming. */
function extractPathFromJson(inputJson?: string): string | null {
  return extractFieldFromJson(inputJson, "file_path");
}
