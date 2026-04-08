import * as http from "http";
import * as fs from "fs";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import * as path from "path";
import {
  CLAUDE_IPC_CONFIG_PATH,
  CLAUDE_SESSIONS_DIR,
  sendToWindow,
  tabClaudeState,
  sessionIdToTabId,
  ptyInstances,
} from "../lib/state";

// HTTP server that receives pushed status updates from the Claude hook
// script (~/.config/edity/claude-hook.sh) and forwards them to the renderer
// as IPC events. Replaces the previous 2-second polling loop that read
// per-session JSON files in ~/.config/edity/claude-status/.
//
// Wire: hook runs → curl POST /claude-status → handleHookStatus → resolve
//       sessionId → tabId → mutate tabClaudeState → sendToWindow event.

const BODY_LIMIT_BYTES = 16 * 1024;
const BODY_READ_TIMEOUT_MS = 1000;

let server: http.Server | null = null;
let token: string | null = null;

interface HookPayload {
  status: string;
  sessionId: string;
  claudePid?: number;
  ts?: number;
}

function isHookPayload(v: unknown): v is HookPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.status === "string" && typeof o.sessionId === "string";
}

// Walk the PID tree starting from `shellPid` looking for a `claude` process.
// Duplicated from claude-detection.ts so this module stays self-contained —
// the original copy is also still used by get_claude_status and should not
// move (small helper, cheap to duplicate).
function findClaudePidFrom(shellPid: number): number | null {
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

      const psResult = spawnSync(
        "ps",
        ["-o", "comm=", "-p", String(currentPid)],
        { encoding: "utf-8", timeout: 2000 },
      );
      const name = psResult.stdout?.trim();
      if (name && name.includes("claude")) return currentPid;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readSessionFile(
  claudePid: number,
): { sessionId?: string; cwd?: string; startedAt?: string } | null {
  const sessionPath = path.join(CLAUDE_SESSIONS_DIR, `${claudePid}.json`);
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Resolve which tab a hook message belongs to.
 *
 * Fast path: the sessionIdToTabId cache already knows the answer from a
 * previous event. Fallbacks walk tabs marked as Claude Code and match by
 * claudePid or by reading Claude's session metadata from the PID tree.
 */
function resolveTabId(payload: HookPayload): string | null {
  const cached = sessionIdToTabId.get(payload.sessionId);
  if (cached && tabClaudeState.has(cached)) return cached;

  // Try matching by the Claude PID the hook script reports as $PPID.
  if (typeof payload.claudePid === "number") {
    for (const [tabId, state] of tabClaudeState) {
      if (state.claudePid === payload.claudePid) {
        sessionIdToTabId.set(payload.sessionId, tabId);
        state.sessionId = payload.sessionId;
        return tabId;
      }
    }
  }

  // Walk every Claude tab, look up Claude's PID in its PTY, read the
  // session file, and match sessionId. First hit wins.
  for (const [tabId, state] of tabClaudeState) {
    if (!state.isClaudeCode) continue;
    const proc = ptyInstances.get(tabId);
    if (!proc) continue;

    let claudePid = state.claudePid;
    if (!claudePid) {
      claudePid = findClaudePidFrom(proc.pid);
      if (claudePid) state.claudePid = claudePid;
    }
    if (!claudePid) continue;

    const session = readSessionFile(claudePid);
    if (session?.sessionId === payload.sessionId) {
      sessionIdToTabId.set(payload.sessionId, tabId);
      state.sessionId = payload.sessionId;
      return tabId;
    }
  }

  return null;
}

export function handleHookStatus(payload: HookPayload): boolean {
  const tabId = resolveTabId(payload);
  if (!tabId) return false;

  const state = tabClaudeState.get(tabId);
  if (!state) return false;

  state.status = payload.status;
  sendToWindow("claude-status-changed", {
    tabId,
    sessionId: payload.sessionId,
    status: payload.status,
  });
  if (payload.status === "notification") {
    sendToWindow("claude-notification", { tabId });
  }
  return true;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      req.removeAllListeners();
      reject(new Error("body read timeout"));
    }, BODY_READ_TIMEOUT_MS);

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > BODY_LIMIT_BYTES) {
        clearTimeout(timer);
        req.removeAllListeners();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sendJson(
  res: http.ServerResponse,
  code: number,
  body: Record<string, unknown>,
): void {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/claude-status") {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  const auth = req.headers["authorization"];
  if (!token || auth !== `Bearer ${token}`) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid json" });
    return;
  }

  if (!isHookPayload(parsed)) {
    sendJson(res, 400, { ok: false, error: "invalid payload shape" });
    return;
  }

  const delivered = handleHookStatus(parsed);
  sendJson(res, 200, { ok: true, delivered });
}

export function startClaudeIpcServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    token = crypto.randomBytes(32).toString("hex");
    const srv = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error("[claude-ipc-server] handler error:", err);
        try {
          sendJson(res, 500, { ok: false, error: "internal error" });
        } catch {
          /* ignore */
        }
      });
    });

    srv.on("error", (err) => {
      console.error("[claude-ipc-server] listen error:", err);
      reject(err);
    });

    // 127.0.0.1 + port 0 → kernel assigns a free ephemeral port.
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("unexpected server address"));
        return;
      }
      try {
        fs.writeFileSync(
          CLAUDE_IPC_CONFIG_PATH,
          JSON.stringify({ port: addr.port, token }, null, 2),
          { mode: 0o600 },
        );
        // writeFileSync doesn't always respect mode on existing files; chmod
        // explicitly so a stale config from a previous run (which may have
        // been 0644) can't leak the token after a restart.
        fs.chmodSync(CLAUDE_IPC_CONFIG_PATH, 0o600);
      } catch (err) {
        reject(err);
        return;
      }
      server = srv;
      resolve();
    });
  });
}

export function stopClaudeIpcServer(): void {
  if (!server) return;
  server.close();
  server = null;
  token = null;
  try {
    fs.unlinkSync(CLAUDE_IPC_CONFIG_PATH);
  } catch {
    /* ignore */
  }
}
