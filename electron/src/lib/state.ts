import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import type { ChildProcess } from "child_process";
import type { MessageConnection } from "vscode-jsonrpc/node";

// Runtime __dirname is electron/dist/electron/src/lib/ -> project root is 5 levels up
export const PROJECT_ROOT = path.resolve(__dirname, "../../../../..");

// --- Singleton state shared across all IPC modules ---

export let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function sendToWindow(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// --- Maps ---

export const ptyInstances = new Map<string, IPty>();
export const fileWatchers = new Map<string, fs.FSWatcher>();
export const runningProcesses = new Map<string, ChildProcess>();

// --- LSP state ---
//
// Servers are keyed by `${projectId}:${serverName}` so e.g. clangd is shared
// across all C/C++ files in a project but scoped per-project.

export interface LspServerHandle {
  key: string;
  projectId: string;
  serverName: string;
  projectPath: string;
  rootPath: string;
  process: ChildProcess;
  connection: MessageConnection;
  initialized: boolean;
  // Set of absolute file paths currently `didOpen`ed with this server.
  openDocuments: Set<string>;
}

export const lspServers = new Map<string, LspServerHandle>();

export interface TabClaudeState {
  isClaudeCode: boolean;
  oscTitle: string | null;
  status: string | null;
  claudePid: number | null;
  sessionId: string | null;
  oscBuffer: string;
  pidLookupAt: number;
}

export const tabClaudeState = new Map<string, TabClaudeState>();

/**
 * Reverse lookup used by the Claude IPC server to route hook messages
 * to the right tab without re-walking the PID tree on every event. Populated
 * lazily on the first hook arriving for each session.
 */
export const sessionIdToTabId = new Map<string, string>();

// --- Project dir watcher ---

export let projectDirWatcher: fs.FSWatcher | null = null;
export let projectDirDebounce: ReturnType<typeof setTimeout> | null = null;

export function setProjectDirWatcher(w: fs.FSWatcher | null): void {
  projectDirWatcher = w;
}

export function setProjectDirDebounce(d: ReturnType<typeof setTimeout> | null): void {
  projectDirDebounce = d;
}

// --- Config paths ---
//
// In dev mode (running via the Vite dev server) we keep all global state in
// a separate `edity-dev` directory so local development can't corrupt the
// production app's projects, settings, claude IPC config, or Claude hooks.
const CONFIG_DIR_NAME = process.env.VITE_DEV_SERVER_URL ? "edity-dev" : "edity";

export const CONFIG_DIR = path.join(os.homedir(), ".config", CONFIG_DIR_NAME);
export const PROJECTS_PATH = path.join(CONFIG_DIR, "projects.json");
export const HOOK_SCRIPT_PATH = path.join(CONFIG_DIR, "claude-hook.sh");
export const CLAUDE_IPC_CONFIG_PATH = path.join(CONFIG_DIR, "claude-ipc.json");
export const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");
export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
export const CLAUDE_SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");
