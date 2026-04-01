import { ipcMain, BrowserWindow, app } from "electron";
import * as path from "path";
import { pathToFileURL } from "url";
import type {
  PermissionResult,
  SDKMessage,
  SDKSessionInfo as SDKSessionInfoType,
  SessionMessage,
  Query,
  Options as SDKOptions,
  PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk/sdk";
import type { ClaudeSessionInfo, ClaudeSessionMessage } from "../../../shared/types/ipc";
import { createLogger } from "../lib/logger";

const log = createLogger("claude-sdk");

interface PermissionCallback {
  resolve: (value: PermissionResult) => void;
  input?: Record<string, unknown>;
  toolName?: string;
}

interface ClaudeSession {
  abortController: AbortController;
  permissionCallbacks: Map<string, PermissionCallback>;
  mainWindow: BrowserWindow;
  sessionId: string;
  batchBuffer: SDKMessage[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

const claudeSessions = new Map<string, ClaudeSession>();

/** Messages synthesized by the IPC layer (not from the SDK stream). */
type SyntheticMessage =
  | { type: "error"; message: string }
  | { type: "result"; subtype: "success" }
  | { type: "permission_request"; toolName: string; input: unknown; toolUseID: string; title?: string; displayName?: string; description?: string }
  | { type: "ask_user_question"; toolName: string; input: unknown; toolUseID: string };

interface ClaudeSDK {
  query(params: { prompt: string; options?: SDKOptions }): Query;
  listSessions(options?: { dir?: string }): Promise<SDKSessionInfoType[]>;
  getSessionMessages(sessionId: string, options?: { dir?: string }): Promise<SessionMessage[]>;
}

let sdkModule: ClaudeSDK | null = null;

/** Resolve SDK paths -- handles both dev (node_modules) and packaged (asar.unpacked). */
function getSdkPath(file: string): string {
  const appPath = app.getAppPath();
  const rel = path.join("node_modules", "@anthropic-ai", "claude-agent-sdk", file);
  if (appPath.includes("app.asar")) {
    return path.join(appPath.replace("app.asar", "app.asar.unpacked"), rel);
  }
  return path.join(appPath, rel);
}

// Use Function constructor to preserve real import() -- TypeScript CJS compilation converts
// import() to require() which cannot load ESM modules. This bypasses that transformation.
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ClaudeSDK>;

async function loadSDK(): Promise<ClaudeSDK> {
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
      log.debug("->", msg);
      session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, msg);
    }
  }
}

function sendToRenderer(session: ClaudeSession, message: SDKMessage | SyntheticMessage): void {
  if ("type" in message && message.type === "stream_event") {
    session.batchBuffer.push(message);
    if (!session.batchTimer) {
      session.batchTimer = setTimeout(() => {
        session.batchTimer = null;
        flushBatch(session);
      }, 16);
    }
    return;
  }

  flushBatch(session);
  if (session.batchTimer) {
    clearTimeout(session.batchTimer);
    session.batchTimer = null;
  }

  log.debug("->", message);
  if (session.mainWindow && !session.mainWindow.isDestroyed()) {
    session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, message);
  }
}

function isInterrupted(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const msg = err.message;
    return msg.includes("aborted") || msg.includes("interrupted") || msg.includes("all fibers interrupted");
  }
  return String(err).includes("aborted");
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runSessionLoop(session: ClaudeSession, queryIterator: AsyncIterable<SDKMessage>): Promise<void> {
  let hadResult = false;
  let hadError = false;
  try {
    for await (const message of queryIterator) {
      if (message.type === "result") hadResult = true;
      sendToRenderer(session, message);
    }
  } catch (err: unknown) {
    hadError = true;
    if (isInterrupted(err)) return;
    log.error("Session loop error:", err);
    sendToRenderer(session, {
      type: "error",
      message: getErrorMessage(err) || "Unknown error",
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

const PERMISSION_MODES = new Set<SDKPermissionMode>(["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"]);

function toPermissionMode(value: string | undefined): SDKPermissionMode {
  if (value && PERMISSION_MODES.has(value as SDKPermissionMode)) {
    return value as SDKPermissionMode;
  }
  return "default";
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

    const queryOptions: SDKOptions = {
      abortController,
      cwd: projectPath,
      pathToClaudeCodeExecutable: getSdkPath("cli.js"),
      permissionMode: toPermissionMode(permissionMode),
      betas: ["context-1m-2025-08-07"],
      includePartialMessages: true,
      model,
      resume,
      canUseTool: (toolName, input, options) => {
        return new Promise<PermissionResult>((resolve) => {
          const toolUseID = options.toolUseID;
          session.permissionCallbacks.set(toolUseID, { resolve, input, toolName });

          options.signal.addEventListener("abort", () => {
            if (session.permissionCallbacks.has(toolUseID)) {
              session.permissionCallbacks.delete(toolUseID);
              resolve({ behavior: "deny", message: "Aborted" });
            }
          }, { once: true });

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
              title: options.title,
              displayName: options.displayName,
              description: options.description,
            });
          }
        });
      },
    };

    const queryIterator = sdk.query({ prompt, options: queryOptions });
    runSessionLoop(session, queryIterator);
  } catch (err: unknown) {
    log.error("Failed to start session:", err);
    sendToRenderer(session, {
      type: "error",
      message: `Failed to start Claude session: ${getErrorMessage(err)}`,
    });
    claudeSessions.delete(sessionId);
  }

  return { sessionId };
}

async function listSessions(args: { projectPath: string }): Promise<ClaudeSessionInfo[]> {
  const sdk = await loadSDK();
  try {
    const sessions = await sdk.listSessions({ dir: args.projectPath });
    return (sessions || []).map((s) => ({
      sessionId: s.sessionId,
      summary: s.summary || s.firstPrompt || "Untitled",
      lastModified: s.lastModified || 0,
      cwd: s.cwd,
      gitBranch: s.gitBranch,
    }));
  } catch (err) {
    log.error("Failed to list sessions:", err);
    return [];
  }
}

async function getSessionMessages(args: { sessionId: string; projectPath: string }): Promise<ClaudeSessionMessage[]> {
  const sdk = await loadSDK();
  try {
    const messages = await sdk.getSessionMessages(args.sessionId, { dir: args.projectPath });
    return (messages || []).map((m) => ({
      type: m.type,
      uuid: m.uuid,
      session_id: m.session_id,
      message: m.message,
    }));
  } catch (err) {
    log.error("Failed to get session messages:", err);
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
    callback.resolve({
      behavior: "allow",
      updatedInput: {
        questions: callback.input?.questions ?? [],
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
