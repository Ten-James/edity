import { ipcMain } from "electron";
import { spawn } from "child_process";
import * as path from "path";
import { pathToFileURL } from "url";
import {
  StreamMessageReader,
  StreamMessageWriter,
  createMessageConnection,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import {
  LSP_SERVERS,
  type LspLanguage,
  locateBinary,
  findRootDir,
  getServerConfigForLanguage,
} from "../lib/lsp-servers";
import { lspServers, sendToWindow, type LspServerHandle } from "../lib/state";

function makeServerKey(projectId: string, serverName: string): string {
  return `${projectId}:${serverName}`;
}

function pathToUri(p: string): string {
  return pathToFileURL(p).toString();
}

// Default client capabilities. Tuned for the features we actually surface
// (completion, hover, definition, references, diagnostics, document/workspace
// symbols, signature help). Anything beyond this is not advertised so the
// server doesn't waste time sending us payloads we'll just drop.
function buildClientCapabilities(): Record<string, unknown> {
  return {
    workspace: {
      applyEdit: false,
      workspaceEdit: { documentChanges: false },
      didChangeConfiguration: { dynamicRegistration: false },
      didChangeWatchedFiles: { dynamicRegistration: false },
      symbol: {
        dynamicRegistration: false,
        symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
      },
      executeCommand: { dynamicRegistration: false },
      workspaceFolders: true,
      configuration: true,
    },
    textDocument: {
      synchronization: {
        dynamicRegistration: false,
        willSave: false,
        willSaveWaitUntil: false,
        didSave: true,
      },
      publishDiagnostics: {
        relatedInformation: true,
        versionSupport: false,
        tagSupport: { valueSet: [1, 2] },
      },
      completion: {
        dynamicRegistration: false,
        completionItem: {
          snippetSupport: true,
          commitCharactersSupport: true,
          documentationFormat: ["markdown", "plaintext"],
          deprecatedSupport: true,
          insertReplaceSupport: true,
          resolveSupport: { properties: ["documentation", "detail"] },
          insertTextModeSupport: { valueSet: [1, 2] },
          labelDetailsSupport: true,
        },
        completionItemKind: {
          valueSet: Array.from({ length: 25 }, (_, i) => i + 1),
        },
        contextSupport: true,
      },
      hover: {
        dynamicRegistration: false,
        contentFormat: ["markdown", "plaintext"],
      },
      signatureHelp: {
        dynamicRegistration: false,
        signatureInformation: {
          documentationFormat: ["markdown", "plaintext"],
          parameterInformation: { labelOffsetSupport: true },
          activeParameterSupport: true,
        },
      },
      definition: { dynamicRegistration: false, linkSupport: true },
      references: { dynamicRegistration: false },
      documentSymbol: {
        dynamicRegistration: false,
        symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
        hierarchicalDocumentSymbolSupport: true,
      },
      formatting: { dynamicRegistration: false },
      rangeFormatting: { dynamicRegistration: false },
      rename: { dynamicRegistration: false, prepareSupport: true },
    },
    general: {
      positionEncodings: ["utf-16"],
    },
  };
}

async function startLspServer(
  projectId: string,
  projectPath: string,
  lang: LspLanguage,
  filePath: string,
): Promise<{ ok: true; key: string } | { ok: false; reason: string; hint?: string }> {
  const entry = getServerConfigForLanguage(lang);
  if (!entry) return { ok: false, reason: `no server configured for ${lang}` };

  const { name: serverName, config } = entry;
  const key = makeServerKey(projectId, serverName);

  // Already running for this project? Reuse it.
  if (lspServers.has(key)) {
    return { ok: true, key };
  }

  const binary = locateBinary(config.binary);
  if (!binary) {
    return { ok: false, reason: "binary not found", hint: config.installHint };
  }

  const fileDir = path.dirname(filePath);
  const rootPath = findRootDir(fileDir, config.rootMarkers, projectPath);

  const child = spawn(binary, config.args, {
    cwd: rootPath,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (!child.stdout || !child.stdin || !child.stderr) {
    child.kill();
    return { ok: false, reason: "failed to open server pipes" };
  }

  // Surface server stderr in main-process logs (helps debug missing config).
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[lsp:${serverName}] ${chunk.toString("utf-8")}`);
  });

  const reader = new StreamMessageReader(child.stdout);
  const writer = new StreamMessageWriter(child.stdin);
  const connection: MessageConnection = createMessageConnection(reader, writer);

  // Forward all server-to-client requests/notifications to the renderer over
  // a single IPC channel keyed by the server key. We do NOT speak LSP in the
  // main process — we are a thin transport.
  connection.onNotification((method, params) => {
    sendToWindow(`lsp:notification:${key}`, { method, params });
  });
  connection.onRequest((method, params) => {
    // Server-to-client requests (e.g. workspace/configuration). The renderer
    // is responsible for replying via the `lsp_respond` channel. We use a
    // promise that resolves when the renderer responds. Track pending requests
    // by id below.
    return new Promise((resolve) => {
      const requestId = ++pendingRequestSeq;
      pendingServerRequests.set(requestId, resolve);
      sendToWindow(`lsp:request:${key}`, { id: requestId, method, params });
      // Hard timeout — if the renderer never replies (e.g. dialog closed
      // mid-flight) we don't want to hang the server forever.
      setTimeout(() => {
        if (pendingServerRequests.has(requestId)) {
          pendingServerRequests.delete(requestId);
          resolve(null);
        }
      }, 30_000);
    });
  });

  connection.onClose(() => {
    sendToWindow(`lsp:exit:${key}`, { code: child.exitCode, signal: null });
    lspServers.delete(key);
  });
  connection.onError((err) => {
    process.stderr.write(`[lsp:${serverName}] connection error: ${String(err)}\n`);
  });

  child.on("exit", (code, signal) => {
    sendToWindow(`lsp:exit:${key}`, { code, signal });
    lspServers.delete(key);
  });

  connection.listen();

  const handle: LspServerHandle = {
    key,
    projectId,
    serverName,
    projectPath,
    rootPath,
    process: child,
    connection,
    initialized: false,
    openDocuments: new Set(),
  };
  lspServers.set(key, handle);

  // Drive the LSP initialize handshake here so the renderer never has to
  // worry about the order of operations.
  try {
    const initParams = {
      processId: process.pid,
      clientInfo: { name: "Edity", version: "1.0.0" },
      locale: "en",
      rootPath,
      rootUri: pathToUri(rootPath),
      capabilities: buildClientCapabilities(),
      initializationOptions: config.initializationOptions ?? {},
      workspaceFolders: [
        { uri: pathToUri(rootPath), name: path.basename(rootPath) },
      ],
    };
    await connection.sendRequest("initialize", initParams);
    connection.sendNotification("initialized", {});
    handle.initialized = true;
    // Some servers (rust-analyzer) only push config via this notification.
    connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {},
    });
    return { ok: true, key };
  } catch (err) {
    process.stderr.write(`[lsp:${serverName}] initialize failed: ${String(err)}\n`);
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    lspServers.delete(key);
    return { ok: false, reason: `initialize failed: ${String(err)}` };
  }
}

// Server-to-client request bookkeeping (e.g. workspace/configuration).
let pendingRequestSeq = 0;
const pendingServerRequests = new Map<number, (value: unknown) => void>();

async function shutdownServer(handle: LspServerHandle): Promise<void> {
  try {
    await Promise.race([
      handle.connection.sendRequest("shutdown"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    handle.connection.sendNotification("exit");
  } catch {
    /* server already gone */
  }
  try {
    handle.connection.dispose();
  } catch {
    /* ignore */
  }
  try {
    handle.process.kill();
  } catch {
    /* ignore */
  }
  lspServers.delete(handle.key);
}

export function shutdownAllLspServers(): Promise<void[]> {
  const all = Array.from(lspServers.values());
  return Promise.all(all.map(shutdownServer));
}

export function registerLspHandlers(): void {
  // Detect whether a server binary is on PATH. Returns metadata the renderer
  // can use to show install hints. Cached at the locator level.
  ipcMain.handle(
    "lsp_detect_server",
    (_event, { lang }: { lang: LspLanguage }) => {
      const entry = getServerConfigForLanguage(lang);
      if (!entry) return { available: false, reason: "no server configured" };
      const binPath = locateBinary(entry.config.binary);
      return {
        available: !!binPath,
        binary: entry.config.binary,
        binaryPath: binPath,
        serverName: entry.name,
        installHint: entry.config.installHint,
      };
    },
  );

  ipcMain.handle("lsp_list_servers", () => {
    return Object.entries(LSP_SERVERS).map(([name, cfg]) => ({
      name,
      languages: cfg.languages,
      binary: cfg.binary,
      installed: !!locateBinary(cfg.binary),
    }));
  });

  // Lazy-start a server for (project, language). Idempotent — returns the
  // same key on subsequent calls. The renderer never speaks raw stdio; it
  // sends LSP requests through `lsp_request` / `lsp_notify` keyed by this
  // serverKey.
  ipcMain.handle(
    "lsp_start",
    async (
      _event,
      {
        projectId,
        projectPath,
        lang,
        filePath,
      }: {
        projectId: string;
        projectPath: string;
        lang: LspLanguage;
        filePath: string;
      },
    ) => {
      return startLspServer(projectId, projectPath, lang, filePath);
    },
  );

  // Send a JSON-RPC request to the server and await a typed response. Used
  // for completion, hover, definition, references, symbol queries, etc.
  ipcMain.handle(
    "lsp_request",
    async (
      _event,
      {
        key,
        method,
        params,
      }: { key: string; method: string; params: unknown },
    ) => {
      const handle = lspServers.get(key);
      if (!handle) return { ok: false, error: "no such server" };
      try {
        const result = await handle.connection.sendRequest(method, params);
        return { ok: true, result };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  // Fire-and-forget notification (didOpen, didChange, didClose, etc).
  ipcMain.handle(
    "lsp_notify",
    (
      _event,
      {
        key,
        method,
        params,
      }: { key: string; method: string; params: unknown },
    ) => {
      const handle = lspServers.get(key);
      if (!handle) return { ok: false, error: "no such server" };
      try {
        handle.connection.sendNotification(method, params);
        if (method === "textDocument/didOpen") {
          const p = params as { textDocument?: { uri?: string } };
          if (p?.textDocument?.uri) {
            handle.openDocuments.add(p.textDocument.uri);
          }
        } else if (method === "textDocument/didClose") {
          const p = params as { textDocument?: { uri?: string } };
          if (p?.textDocument?.uri) {
            handle.openDocuments.delete(p.textDocument.uri);
          }
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  // Renderer reply to a server-to-client request (workspace/configuration etc).
  ipcMain.handle(
    "lsp_respond",
    (_event, { id, result }: { id: number; result: unknown }) => {
      const resolver = pendingServerRequests.get(id);
      if (!resolver) return { ok: false, error: "no pending request" };
      pendingServerRequests.delete(id);
      resolver(result);
      return { ok: true };
    },
  );

  ipcMain.handle("lsp_stop", async (_event, { key }: { key: string }) => {
    const handle = lspServers.get(key);
    if (!handle) return { ok: true };
    await shutdownServer(handle);
    return { ok: true };
  });

  ipcMain.handle("lsp_stop_project", async (_event, { projectId }: { projectId: string }) => {
    const toStop = Array.from(lspServers.values()).filter(
      (h) => h.projectId === projectId,
    );
    await Promise.all(toStop.map(shutdownServer));
    return { ok: true };
  });
}
