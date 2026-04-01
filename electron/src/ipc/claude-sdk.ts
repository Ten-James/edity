import { ipcMain, BrowserWindow, app } from "electron";
import * as path from "path";
import { pathToFileURL } from "url";
import type { ClaudeSessionInfo, ClaudeSessionMessage } from "../../../shared/types/ipc";
import { createLogger } from "../lib/logger";

const log = createLogger("claude-sdk");

interface PermissionCallback {
  resolve: (value: unknown) => void;
  input?: unknown;
  toolName?: string;
}

interface ClaudeSession {
  abortController: AbortController;
  permissionCallbacks: Map<string, PermissionCallback>;
  mainWindow: BrowserWindow;
  sessionId: string;
  batchBuffer: unknown[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

const claudeSessions = new Map<string, ClaudeSession>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkModule: any = null;

/** Resolve SDK paths — handles both dev (node_modules) and packaged (asar.unpacked). */
function getSdkPath(file: string): string {
  const appPath = app.getAppPath();
  const rel = path.join("node_modules", "@anthropic-ai", "claude-agent-sdk", file);
  if (appPath.includes("app.asar")) {
    return path.join(appPath.replace("app.asar", "app.asar.unpacked"), rel);
  }
  return path.join(appPath, rel);
}

// Use Function constructor to preserve real import() — TypeScript CJS compilation converts import() to require()
// which cannot load ESM modules. This bypasses that transformation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;

async function loadSDK() {
  if (!sdkModule) {
    try {
      const sdkUrl = pathToFileURL(getSdkPath("sdk.mjs")).href;
      sdkModule = await dynamicImport(sdkUrl);
    } catch (err) {
      log.error("Failed to load SDK:", err);
      throw err;
    }
  }
  return sdkModule;
}

function flushBatch(session: ClaudeSession): void {
  if (session.batchBuffer.length === 0) return;
  const messages = session.batchBuffer.splice(0);
  if (session.mainWindow && !session.mainWindow.isDestroyed()) {
    for (const msg of messages) {
      log.debug("→", msg);
      session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, msg);
    }
  }
}

function sendToRenderer(session: ClaudeSession, message: unknown): void {
  const msg = message as { type?: string; parent_tool_use_id?: string; subtype?: string };

  // Batch stream_events for performance, don't log (too verbose)
  if (msg.type === "stream_event") {
    session.batchBuffer.push(message);
    if (!session.batchTimer) {
      session.batchTimer = setTimeout(() => {
        session.batchTimer = null;
        flushBatch(session);
      }, 16);
    }
    return;
  }

  // Flush pending stream_events before sending other message types
  flushBatch(session);
  if (session.batchTimer) {
    clearTimeout(session.batchTimer);
    session.batchTimer = null;
  }

  log.debug("→", message);
  if (session.mainWindow && !session.mainWindow.isDestroyed()) {
    session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, message);
  }
}

function isInterrupted(err: unknown): boolean {
  if ((err as Error).name === "AbortError") return true;
  const msg = String((err as Error).message ?? "");
  return msg.includes("aborted") || msg.includes("interrupted") || msg.includes("all fibers interrupted");
}

async function runSessionLoop(session: ClaudeSession, queryIterator: AsyncIterable<unknown>): Promise<void> {
  let hadResult = false;
  let hadError = false;
  try {
    for await (const message of queryIterator) {
      const msg = message as { type?: string };
      if (msg.type === "result") hadResult = true;
      sendToRenderer(session, message);
    }
  } catch (err: unknown) {
    hadError = true;
    if (isInterrupted(err)) return;
    log.error("Session loop error:", err);
    sendToRenderer(session, {
      type: "error",
      message: (err as Error).message || "Unknown error",
    });
  } finally {
    flushBatch(session);
    if (session.batchTimer) {
      clearTimeout(session.batchTimer);
      session.batchTimer = null;
    }
    if (!hadResult && !hadError) {
      sendToRenderer(session, { type: "result", subtype: "success" });
    }
    for (const [, cb] of session.permissionCallbacks) {
      cb.resolve({ behavior: "deny", message: "Session ended" });
    }
    session.permissionCallbacks.clear();
    if (claudeSessions.get(session.sessionId) === session) {
      claudeSessions.delete(session.sessionId);
    }
  }
}

interface StartSessionArgs {
  sessionId: string;
  projectPath: string;
  prompt: string;
  model?: string;
  permissionMode?: string;
  resume?: string;
}

async function startSession(mainWindow: BrowserWindow, args: StartSessionArgs): Promise<{ sessionId: string }> {
  const { sessionId, projectPath, prompt, model, permissionMode, resume } = args;

  const abortController = new AbortController();

  const session: ClaudeSession = {
    abortController,
    permissionCallbacks: new Map(),
    mainWindow,
    sessionId,
    batchBuffer: [],
    batchTimer: null,
  };

  claudeSessions.set(sessionId, session);

  try {
    const sdk = await loadSDK();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryOptions: any = {
      abortController,
      cwd: projectPath,
      pathToClaudeCodeExecutable: getSdkPath("cli.js"),
      permissionMode: permissionMode || "default",
      betas: ["context-1m-2025-08-07"],
      includePartialMessages: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canUseTool: (toolName: string, input: unknown, options: any) => {
        return new Promise((resolve) => {
          const toolUseID = options?.toolUseID || crypto.randomUUID();
          session.permissionCallbacks.set(toolUseID, { resolve, input, toolName });

          // Handle abort signal from SDK
          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              if (session.permissionCallbacks.has(toolUseID)) {
                session.permissionCallbacks.delete(toolUseID);
                resolve({ behavior: "deny", message: "Aborted" });
              }
            }, { once: true });
          }

          if (toolName === "AskUserQuestion") {
            sendToRenderer(session, {
              type: "ask_user_question",
              toolName,
              input,
              toolUseID,
            });
          } else {
            sendToRenderer(session, {
              type: "permission_request",
              toolName,
              input,
              toolUseID,
              title: options?.title,
              displayName: options?.displayName,
              description: options?.description,
            });
          }
        });
      },
    };

    if (model) queryOptions.model = model;
    if (resume) queryOptions.resume = resume;

    const queryIterator = sdk.query({ prompt, options: queryOptions });
    runSessionLoop(session, queryIterator);
  } catch (err: unknown) {
    log.error("Failed to start session:", err);
    sendToRenderer(session, {
      type: "error",
      message: `Failed to start Claude session: ${(err as Error).message}`,
    });
    claudeSessions.delete(sessionId);
  }

  return { sessionId };
}

async function listSessions(args: { projectPath: string }): Promise<ClaudeSessionInfo[]> {
  const sdk = await loadSDK();
  try {
    if (typeof sdk.listSessions !== "function") return [];
    const sessions = await sdk.listSessions({ dir: args.projectPath });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (sessions || []).map((s: any) => ({
      sessionId: s.sessionId,
      summary: s.summary || s.firstPrompt || "Untitled",
      lastModified: s.lastModified || 0,
      cwd: s.cwd,
      gitBranch: s.gitBranch,
    }));
  } catch (err) {
    console.error("[claude-sdk] Failed to list sessions:", err);
    return [];
  }
}

async function getSessionMessages(args: { sessionId: string; projectPath: string }): Promise<ClaudeSessionMessage[]> {
  const sdk = await loadSDK();
  try {
    if (typeof sdk.getSessionMessages !== "function") return [];
    const messages = await sdk.getSessionMessages(args.sessionId, { dir: args.projectPath });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (messages || []).map((m: any) => ({
      type: m.type,
      uuid: m.uuid,
      session_id: m.session_id,
      message: m.message,
    }));
  } catch (err) {
    console.error("[claude-sdk] Failed to get session messages:", err);
    return [];
  }
}

export function cleanupAllSessions(): void {
  for (const [, session] of claudeSessions) {
    session.abortController.abort();
    if (session.batchTimer) clearTimeout(session.batchTimer);
  }
  claudeSessions.clear();
}

export function registerClaudeSdkHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle("claude_start", (_event, args: StartSessionArgs) => {
    const win = getMainWindow();
    if (!win) throw new Error("No main window");
    return startSession(win, args);
  });

  ipcMain.handle("claude_send", (_event, args: StartSessionArgs & { message: string }) => {
    const { sessionId, message, projectPath, model, permissionMode } = args;
    const existing = claudeSessions.get(sessionId);
    if (existing) {
      existing.abortController.abort();
      claudeSessions.delete(sessionId);
    }
    const win = getMainWindow();
    if (!win) throw new Error("No main window");
    return startSession(win, { sessionId, projectPath, prompt: message, model, permissionMode, resume: sessionId });
  });

  // Regular permission approval (allow/deny)
  ipcMain.handle("claude_approve", (_event, args: { sessionId: string; toolUseID: string; behavior: string; message?: string }) => {
    const session = claudeSessions.get(args.sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    const callback = session.permissionCallbacks.get(args.toolUseID);
    if (!callback) return { ok: false, error: "Permission callback not found" };
    session.permissionCallbacks.delete(args.toolUseID);
    callback.resolve(args.behavior === "allow" ? { behavior: "allow" } : { behavior: "deny", message: args.message || "User denied" });
    return { ok: true };
  });

  // AskUserQuestion answer — returns updatedInput with questions + answers
  ipcMain.handle("claude_answer_question", (_event, args: { sessionId: string; toolUseID: string; answers: Record<string, string> }) => {
    const session = claudeSessions.get(args.sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    const callback = session.permissionCallbacks.get(args.toolUseID);
    if (!callback) return { ok: false, error: "Question callback not found" };
    session.permissionCallbacks.delete(args.toolUseID);
    const originalInput = callback.input as Record<string, unknown> | undefined;
    callback.resolve({
      behavior: "allow",
      updatedInput: {
        questions: originalInput?.questions ?? [],
        answers: args.answers,
      },
    });
    return { ok: true };
  });

  ipcMain.handle("claude_abort", (_event, args: { sessionId: string }) => {
    const session = claudeSessions.get(args.sessionId);
    if (!session) return { ok: false };
    session.abortController.abort();
    claudeSessions.delete(args.sessionId);
    return { ok: true };
  });

  ipcMain.handle("claude_interrupt", (_event, args: { sessionId: string }) => {
    const session = claudeSessions.get(args.sessionId);
    if (!session) return { ok: false };
    session.abortController.abort();
    return { ok: true };
  });

  ipcMain.handle("claude_list_sessions", (_event, args: { projectPath: string }) => {
    return listSessions(args);
  });

  ipcMain.handle("claude_get_session_messages", (_event, args: { sessionId: string; projectPath: string }) => {
    return getSessionMessages(args);
  });
}
