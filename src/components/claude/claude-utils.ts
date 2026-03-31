/**
 * Extract a human-readable summary string from a tool's input.
 * Used by both ClaudeToolCall (header) and ClaudePermissionPrompt (description).
 */
export function getToolSummary(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  const filePath = getFilePath(input);

  switch (toolName) {
    case "Bash":
      return input.command ? String(input.command) : null;
    case "Read":
    case "Edit":
    case "Write":
      return filePath;
    case "Glob":
      return input.pattern ? String(input.pattern) : null;
    case "Grep":
      return input.pattern ? String(input.pattern) : null;
    case "WebSearch":
      return input.query ? String(input.query) : null;
    case "WebFetch":
      return input.url ? String(input.url) : null;
    default:
      return null;
  }
}

/** Extract file_path from tool input, handling both naming conventions. */
export function getFilePath(input: Record<string, unknown>): string | null {
  const raw = input.file_path ?? input.filePath;
  return raw ? String(raw) : null;
}
