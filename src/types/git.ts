export interface GitFileStatus {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  originalPath?: string;
}

export interface GitDiffStats {
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface GitBranchInfo {
  current: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
}

export interface GitBranch {
  name: string;
  shortHash: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  refs: string;
  parentHashes: string[];
}

export interface GitCommitFile {
  path: string;
  status: string;
}

export interface GitCommitDetail {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  body: string;
  files: GitCommitFile[];
  diff: string;
}

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
