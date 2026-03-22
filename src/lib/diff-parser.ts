import type { DiffHunk, FileDiff } from "@/types/git";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(raw: string, filePath: string): FileDiff {
  const lines = raw.split("\n");

  if (raw.includes("Binary files") && raw.includes("differ")) {
    return { filePath, hunks: [], isBinary: true, isNew: false, isDeleted: false };
  }

  const isNew = raw.includes("new file mode");
  const isDeleted = raw.includes("deleted file mode");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] ?? "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] ?? "1"),
        lines: [{ type: "header", content: line }],
      };
      hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        newLineNum: newLine++,
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "remove",
        content: line.slice(1),
        oldLineNum: oldLine++,
      });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  return { filePath, hunks, isBinary: false, isNew, isDeleted };
}
