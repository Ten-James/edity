import { ipcMain } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import {
  PROJECT_ROOT,
  CONFIG_DIR,
  CLAUDE_SETTINGS_PATH,
  CLAUDE_SESSIONS_DIR,
  HOOK_SCRIPT_PATH,
  tabClaudeState,
  ptyInstances,
} from "../lib/state";

const EDITY_HOOK_MARKER = "claude-hook.sh";

interface HookAction {
  type?: string;
  command?: string;
}

interface HookEntry {
  matcher?: string;
  hooks?: HookAction[];
}

type HookSettings = Record<string, HookEntry[]>;

function isEdityHookEntry(entry: HookEntry): boolean {
  return !!entry.hooks?.some((h) => h.command?.includes(EDITY_HOOK_MARKER));
}

function installHookScript(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const src = path.join(PROJECT_ROOT, "electron/claude-hook.sh");
  fs.copyFileSync(src, HOOK_SCRIPT_PATH);
  fs.chmodSync(HOOK_SCRIPT_PATH, 0o755);
}

export function ensureClaudeHooks(): void {
  try {
    installHookScript();

    const claudeDir = path.join(os.homedir(), ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });

    let settings: { hooks?: HookSettings; [key: string]: unknown } = {};
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
    } catch { /* new file */ }

    if (!settings.hooks) settings.hooks = {};
    const hooks = settings.hooks;

    const edityHooks: Record<string, HookEntry> = {
      UserPromptSubmit: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} working` }],
      },
      PreToolUse: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} working` }],
      },
      PostToolUse: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} working` }],
      },
      Stop: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} idle` }],
      },
      Notification: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} notification` }],
      },
    };

    const before = JSON.stringify(hooks);
    for (const [event, hookEntry] of Object.entries(edityHooks)) {
      if (!hooks[event]) hooks[event] = [];
      hooks[event] = hooks[event].filter((entry) => !isEdityHookEntry(entry));
      hooks[event].push(hookEntry);
    }

    if (JSON.stringify(hooks) !== before) {
      fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    }
  } catch (err: unknown) {
    console.error("Failed to inject Claude hooks:", err instanceof Error ? err.message : String(err));
  }
}

function findClaudePid(shellPid: number): number | null {
  try {
    let currentPid = shellPid;
    for (let depth = 0; depth < 10; depth++) {
      const result = spawnSync("pgrep", ["-n", "-P", String(currentPid)], {
        encoding: "utf-8",
        timeout: 2000,
      });
      const child = result.stdout?.trim();
      if (!child) break;
      currentPid = parseInt(child, 10);
      if (isNaN(currentPid)) break;

      const psResult = spawnSync("ps", ["-o", "comm=", "-p", String(currentPid)], {
        encoding: "utf-8",
        timeout: 2000,
      });
      const name = psResult.stdout?.trim();
      if (name && name.includes("claude")) return currentPid;
    }
  } catch { /* ignore */ }
  return null;
}

function readClaudeSession(claudePid: number): { sessionId?: string; cwd?: string; startedAt?: string } | null {
  const sessionPath = path.join(CLAUDE_SESSIONS_DIR, `${claudePid}.json`);
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

/**
 * Detection-time info for a Claude tab. `status` is read from the pushed
 * state (tabClaudeState) that the IPC server mutates when hooks arrive —
 * no more file I/O here. Used by get_claude_status for UI consumers that
 * need a one-shot snapshot (e.g. tooltips); the sidebar dot gets its state
 * from the event-driven claudeStore on the renderer side.
 */
function resolveTabClaudeStatus(tabId: string) {
  const state = tabClaudeState.get(tabId);
  if (!state || !state.isClaudeCode) return null;

  const proc = ptyInstances.get(tabId);
  if (!proc) return null;

  if (state.claudePid) {
    try {
      process.kill(state.claudePid, 0);
    } catch {
      state.isClaudeCode = false;
      state.claudePid = null;
      state.status = null;
      state.sessionId = null;
      return null;
    }
  }

  if (!state.claudePid) {
    const now = Date.now();
    if (now - state.pidLookupAt > 10000) {
      state.pidLookupAt = now;
      state.claudePid = findClaudePid(proc.pid);
    }
  }

  if (state.claudePid && !state.sessionId) {
    const session = readClaudeSession(state.claudePid);
    if (session?.sessionId) state.sessionId = session.sessionId;
  }

  // Supply fresh cwd / startedAt if we have the session file on hand, but
  // fall through to null when Claude hasn't written it yet.
  const session = state.claudePid ? readClaudeSession(state.claudePid) : null;

  return {
    isClaudeCode: true as const,
    oscTitle: state.oscTitle,
    status: state.status || "active",
    sessionId: state.sessionId || session?.sessionId || null,
    cwd: session?.cwd || null,
    startedAt: session?.startedAt || null,
  };
}

export function registerClaudeDetectionHandlers(): void {
  ipcMain.handle("get_claude_status", (_event, { tabId }: { tabId: string }) => {
    return resolveTabClaudeStatus(tabId);
  });
}
