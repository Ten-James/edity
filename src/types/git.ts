// Re-export shared git types
export type {
  GitFileStatus,
  GitDiffStats,
  GitBranchInfo,
  GitBranch,
  GitLogEntry,
  GitCommitFile,
  GitCommitDetail,
} from "@shared/types/ipc";

// Renderer-only diff types (used by GitDiffViewer)
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface FileDiff {
  filePath: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
}
