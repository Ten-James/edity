import type { Project, EdityConfig } from "./project";
import type { GlobalSettings } from "./settings";

// --- Result wrappers ---

export interface OkResult {
  ok: true;
}

export interface ErrorResult {
  ok: false;
  error: string;
}

export type Result = OkResult | ErrorResult;

// --- File types ---

export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export type FileContent =
  | { type: "Text"; content: string; size: number }
  | { type: "Image"; url: string; mime: string; size: number }
  | { type: "Binary"; size: number }
  | { type: "TooLarge"; size: number };

// --- Git types ---

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

// --- Script detection ---

export interface DetectedScript {
  name: string;
  command: string;
  source: string;
}

// --- Claude types ---

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

export interface ClaudeSessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  cwd?: string;
  gitBranch?: string;
}

export interface ClaudeSessionMessage {
  type: "user" | "assistant" | "system";
  uuid: string;
  session_id: string;
  message: unknown;
}

export interface ClaudeStatusResult {
  isClaudeCode: true;
  oscTitle: string | null;
  status: string;
  sessionId: string | null;
  cwd: string | null;
  startedAt: string | null;
}

// --- IPC Handler Map ---
// Maps channel name → { args, return } for type-safe invoke/handle

export interface IpcHandlerMap {
  // Terminal
  spawn_shell: { args: { tabId: string; cwd: string; initialCommand?: string }; ret: void };
  write_to_pty: { args: { tabId: string; data: string }; ret: void };
  resize_pty: { args: { tabId: string; cols: number; rows: number }; ret: void };
  close_pty: { args: { tabId: string }; ret: void };
  get_foreground_process: { args: { tabId: string }; ret: string | null };

  // Claude detection (legacy terminal)
  get_claude_status: { args: { tabId: string }; ret: ClaudeStatusResult | null };
  get_all_claude_statuses: { args: undefined; ret: Record<string, { status: string }> };

  // Claude Agent SDK
  claude_start: { args: { sessionId: string; projectPath: string; prompt: string; model?: string; permissionMode?: string; resume?: string }; ret: { sessionId: string } };
  claude_send: { args: { sessionId: string; projectPath: string; message: string; model?: string; permissionMode?: string }; ret: { sessionId: string } };
  claude_approve: { args: { sessionId: string; toolUseID: string; behavior: "allow" | "deny"; message?: string }; ret: Result };
  claude_abort: { args: { sessionId: string }; ret: { ok: boolean } };
  claude_interrupt: { args: { sessionId: string }; ret: { ok: boolean } };
  claude_list_sessions: { args: { projectPath: string }; ret: ClaudeSessionInfo[] };
  claude_get_session_messages: { args: { sessionId: string; projectPath: string }; ret: ClaudeSessionMessage[] };

  // System
  get_homedir: { args: undefined; ret: string };

  // Projects
  get_projects: { args: undefined; ret: Project[] };
  add_project: { args: { name: string; path: string }; ret: Project };
  remove_project: { args: { id: string }; ret: void };

  // File Tree
  list_directory: { args: { path: string; showIgnored?: boolean }; ret: DirectoryEntry[] };

  // File Viewer
  read_file_content: { args: { path: string }; ret: FileContent };
  get_project_types: { args: { projectPath: string }; ret: { compilerOptions: unknown; libs: Array<{ content: string; filePath: string }> } };
  write_file: { args: { path: string; content: string }; ret: Result };

  // File Operations
  delete_path: { args: { targetPath: string }; ret: Result };
  rename_path: { args: { oldPath: string; newPath: string }; ret: Result };
  create_file: { args: { filePath: string }; ret: Result };
  create_directory: { args: { dirPath: string }; ret: Result };

  // File Watching
  watch_file: { args: { tabId: string; path: string }; ret: void };
  unwatch_file: { args: { tabId: string }; ret: void };
  watch_project_dir: { args: { projectPath: string }; ret: void };
  unwatch_project_dir: { args: undefined; ret: void };

  // Git
  git_status: { args: { cwd: string }; ret: { ok: true; files: GitFileStatus[] } | ErrorResult };
  git_diff_stats: { args: { cwd: string }; ret: { ok: true; additions: number; deletions: number; changedFiles: number } };
  git_branch_info: { args: { cwd: string }; ret: ({ ok: true } & GitBranchInfo) | ErrorResult };
  git_branches: { args: { cwd: string }; ret: { ok: true; branches: GitBranch[] } | ErrorResult };
  git_log: { args: { cwd: string; count?: number; skip?: number }; ret: { ok: true; entries: GitLogEntry[] } | ErrorResult };
  git_show_commit: { args: { cwd: string; hash: string }; ret: ({ ok: true } & GitCommitDetail) | ErrorResult };
  git_file_diff: { args: { cwd: string; filePath: string; staged?: boolean }; ret: { ok: true; diff: string } | ErrorResult };
  git_stage: { args: { cwd: string; paths: string[] }; ret: Result };
  git_unstage: { args: { cwd: string; paths: string[] }; ret: Result };
  git_discard: { args: { cwd: string; paths: string[] }; ret: Result };
  git_commit: { args: { cwd: string; message: string }; ret: { ok: true; hash?: string } | ErrorResult };
  git_push: { args: { cwd: string; setUpstream?: boolean }; ret: Result };
  git_pull: { args: { cwd: string }; ret: Result };
  git_fetch: { args: { cwd: string }; ret: Result };
  git_switch_branch: { args: { cwd: string; branch: string }; ret: Result };
  git_create_branch: { args: { cwd: string; branch: string; checkout?: boolean }; ret: Result };
  git_delete_branch: { args: { cwd: string; branch: string; force?: boolean }; ret: Result };

  // Edity Config
  read_edity_config: { args: { projectPath: string }; ret: EdityConfig | null };
  write_edity_config: { args: { projectPath: string; config: EdityConfig }; ret: EdityConfig };

  // Script Detection
  detect_project_scripts: { args: { projectPath: string }; ret: DetectedScript[] };

  // Background Process
  run_project_command: { args: { projectId: string; command: string; cwd: string; commandId?: string }; ret: { pid: number | undefined } };
  kill_project_command: { args: { projectId: string; commandId?: string }; ret: void };

  // Settings
  get_settings: { args: undefined; ret: GlobalSettings };
  save_settings: { args: { settings: GlobalSettings }; ret: void };

  // Dialog
  "show-open-dialog": { args: { properties?: string[]; title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }; ret: { canceled: boolean; filePaths: string[] } };
}

// --- IPC Event Map (main → renderer push events) ---

export interface IpcEventMap {
  "claude-notification": { tabId: string };
  "directory-changed": void;
  "fullscreen-changed": boolean;
  [key: `pty-output-${string}`]: string;
  [key: `file-changed-${string}`]: void;
  [key: `project-run-exit-${string}`]: void;
  [key: `claude-msg-${string}`]: unknown;
}
