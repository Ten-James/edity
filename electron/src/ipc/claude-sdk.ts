import { ipcMain, BrowserWindow } from "electron";
import type { ClaudeSessionInfo } from "../../../shared/types/ipc";

interface ClaudeSession {
  abortController: AbortController;
  permissionCallbacks: Map<string, { resolve: (value: unknown) => void }>;
  mainWindow: BrowserWindow;
  sessionId: string;
  batchBuffer: unknown[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

const claudeSessions = new Map<string, ClaudeSession>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkModule: any = null;

async function loadSDK() {
  if (!sdkModule) {
    sdkModule = await import("@anthropic-ai/claude-agent-sdk");
  }
  return sdkModule;
}

function flushBatch(session: ClaudeSession): void {
  if (session.batchBuffer.length === 0) return;
  const messages = session.batchBuffer.splice(0);
  if (session.mainWindow && !session.mainWindow.isDestroyed()) {
    for (const msg of messages) {
      session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, msg);
    }
  }
}

function sendToRenderer(session: ClaudeSession, message: unknown): void {
  const msg = message as { type?: string };
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

  flushBatch(session);
  if (session.batchTimer) {
    clearTimeout(session.batchTimer);
    session.batchTimer = null;
  }

  if (session.mainWindow && !session.mainWindow.isDestroyed()) {
    session.mainWindow.webContents.send(`claude-msg-${session.sessionId}`, message);
  }
}

async function runSessionLoop(session: ClaudeSession, queryIterator: AsyncIterable<unknown>): Promise<void> {
  try {
    for await (const message of queryIterator) {
      sendToRenderer(session, message);
    }
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") return;
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
  const sdk = await loadSDK();

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryOptions: any = {
    abortController,
    cwd: projectPath,
    allowedTools: [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "WebSearch", "WebFetch", "Agent", "AskUserQuestion",
    ],
    permissionMode: permissionMode || "default",
    includePartialMessages: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canUseTool: (toolName: string, input: unknown, options: any) => {
      return new Promise((resolve) => {
        const toolUseID = options?.tool_use_id || crypto.randomUUID();
        session.permissionCallbacks.set(toolUseID, { resolve });
        sendToRenderer(session, {
          type: "permission_request",
          toolName,
          input,
          toolUseID,
          title: options?.title,
          displayName: options?.displayName,
          description: options?.description,
        });
      });
    },
  };

  if (model) queryOptions.model = model;
  if (resume) queryOptions.resume = resume;

  const queryIterator = sdk.query({ prompt, options: queryOptions });
  runSessionLoop(session, queryIterator);

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
  } catch {
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

  ipcMain.handle("claude_approve", (_event, args: { sessionId: string; toolUseID: string; behavior: string; message?: string }) => {
    const session = claudeSessions.get(args.sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    const callback = session.permissionCallbacks.get(args.toolUseID);
    if (!callback) return { ok: false, error: "Permission callback not found" };
    session.permissionCallbacks.delete(args.toolUseID);
    callback.resolve(args.behavior === "allow" ? { behavior: "allow" } : { behavior: "deny", message: args.message || "User denied" });
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
}
