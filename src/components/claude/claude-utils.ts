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
      return input.command ? String(input.command) : null;
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
      return input.description ? String(input.description) : input.prompt ? String(input.prompt).slice(0, 80) : null;
    case "AskUserQuestion":
      return input.question ? String(input.question).slice(0, 80) : null;
    default:
      return null;
  }
}

/** Extract file_path from tool input, handling both naming conventions. */
export function getFilePath(input: Record<string, unknown>): string | null {
  const raw = input.file_path ?? input.filePath;
  return raw ? String(raw) : null;
}

/** Try to extract file_path from partial inputJson during streaming. */
function extractPathFromJson(inputJson?: string): string | null {
  if (!inputJson) return null;
  const match = inputJson.match(/"file_path"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}
