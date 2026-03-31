import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import type { ChildProcess } from "child_process";

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

export interface TabClaudeState {
  isClaudeCode: boolean;
  oscTitle: string | null;
  status: string | null;
  claudePid: number | null;
  oscBuffer: string;
  pidLookupAt: number;
}

export const tabClaudeState = new Map<string, TabClaudeState>();

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

export const CONFIG_DIR = path.join(os.homedir(), ".config", "edity");
export const PROJECTS_PATH = path.join(CONFIG_DIR, "projects.json");
export const CLAUDE_STATUS_DIR = path.join(CONFIG_DIR, "claude-status");
export const HOOK_SCRIPT_PATH = path.join(CONFIG_DIR, "claude-hook.sh");
export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
export const CLAUDE_SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");
