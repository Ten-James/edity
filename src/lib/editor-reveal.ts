// Cross-component channel for "open this file and jump to line/column".
//
// `dispatch({ type: "tab-open-file", filePath })` opens a file but Monaco
// has no built-in way to scroll to a position from outside the editor. The
// fuzzy finder (and any future caller) registers a pending reveal *before*
// dispatching the open event; the Monaco editor hook consumes it on mount
// or via a content-change effect.

interface PendingReveal {
  line: number; // 1-based
  column: number; // 1-based
}

const pending = new Map<string, PendingReveal>();

export function setPendingReveal(filePath: string, line: number, column: number): void {
  pending.set(filePath, { line, column });
}

export function consumePendingReveal(filePath: string): PendingReveal | null {
  const entry = pending.get(filePath);
  if (!entry) return null;
  pending.delete(filePath);
  return entry;
}
