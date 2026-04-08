// Renderer-side LSP client. This is a *thin* wrapper around the IPC bridge
// in `electron/src/ipc/lsp.ts`. The main process owns the actual JSON-RPC
// connection to the language server; we just send/receive parsed messages.
//
// Each `LspClient` instance corresponds to one server-key (one language
// server, one project). Multiple files of the same language share a client
// via the registry in `./registry.ts`.

import { invoke } from "@/lib/ipc";
import type { LspLanguageId } from "./lang-map";

interface LspMessage {
  method: string;
  params?: unknown;
}

interface LspServerRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface LspStartParams {
  projectId: string;
  projectPath: string;
  lang: LspLanguageId;
  filePath: string;
}

export interface LspStartFailure {
  ok: false;
  reason: string;
  hint?: string;
}

export interface LspStartSuccess {
  ok: true;
  key: string;
}

export type LspStartResult = LspStartSuccess | LspStartFailure;

interface RawIpcResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
}

type NotificationListener = (params: unknown) => void;
type ServerRequestHandler = (
  method: string,
  params: unknown,
) => unknown | Promise<unknown>;

export class LspClient {
  readonly key: string;
  readonly lang: LspLanguageId;
  readonly projectId: string;
  readonly projectPath: string;
  // Server capabilities returned by `initialize`. Stored on the registry
  // when the client starts so providers can capability-gate themselves.
  capabilities: Record<string, unknown> = {};

  private notificationListeners = new Map<string, Set<NotificationListener>>();
  private serverRequestHandler: ServerRequestHandler | null = null;
  private cleanupFns: Array<() => void> = [];
  private disposed = false;

  constructor(params: { key: string; lang: LspLanguageId; projectId: string; projectPath: string }) {
    this.key = params.key;
    this.lang = params.lang;
    this.projectId = params.projectId;
    this.projectPath = params.projectPath;
    this.attachIpcListeners();
  }

  private attachIpcListeners(): void {
    const notifChannel = `lsp:notification:${this.key}`;
    const reqChannel = `lsp:request:${this.key}`;
    const exitChannel = `lsp:exit:${this.key}`;

    const offNotif = window.electronAPI.on(notifChannel, (msg: unknown) => {
      const m = msg as LspMessage;
      const listeners = this.notificationListeners.get(m.method);
      if (!listeners) return;
      for (const fn of listeners) {
        try {
          fn(m.params);
        } catch (err) {
          console.error(`[lsp:${this.key}] notification handler error`, err);
        }
      }
    });
    this.cleanupFns.push(offNotif);

    const offReq = window.electronAPI.on(reqChannel, async (msg: unknown) => {
      const r = msg as LspServerRequest;
      let result: unknown = null;
      if (this.serverRequestHandler) {
        try {
          result = await this.serverRequestHandler(r.method, r.params);
        } catch (err) {
          console.error(`[lsp:${this.key}] server request handler error`, err);
        }
      }
      try {
        await invoke("lsp_respond", { id: r.id, result });
      } catch {
        /* renderer might be tearing down */
      }
    });
    this.cleanupFns.push(offReq);

    const offExit = window.electronAPI.on(exitChannel, () => {
      // Server died — let listeners know via a synthetic notification.
      const listeners = this.notificationListeners.get("$/exit");
      if (listeners) {
        for (const fn of listeners) fn(null);
      }
    });
    this.cleanupFns.push(offExit);
  }

  // Subscribe to a server-pushed notification (e.g. `textDocument/publishDiagnostics`).
  onNotification(method: string, listener: NotificationListener): () => void {
    let set = this.notificationListeners.get(method);
    if (!set) {
      set = new Set();
      this.notificationListeners.set(method, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  // Server-to-client requests (workspace/configuration, etc). Only one
  // handler — usually a static dispatcher in registry.ts.
  setServerRequestHandler(handler: ServerRequestHandler | null): void {
    this.serverRequestHandler = handler;
  }

  // Send a JSON-RPC request and wait for the typed response.
  async sendRequest<T = unknown>(method: string, params: unknown): Promise<T | null> {
    if (this.disposed) return null;
    const reply = await invoke<RawIpcResponse<T>>("lsp_request", {
      key: this.key,
      method,
      params,
    });
    if (!reply.ok) {
      console.warn(`[lsp:${this.key}] request ${method} failed:`, reply.error);
      return null;
    }
    return (reply.result ?? null) as T | null;
  }

  // Fire-and-forget notification.
  async sendNotification(method: string, params: unknown): Promise<void> {
    if (this.disposed) return;
    await invoke<RawIpcResponse>("lsp_notify", {
      key: this.key,
      method,
      params,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.cleanupFns) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.cleanupFns = [];
    this.notificationListeners.clear();
  }
}

// One-shot factory: ask main to start the server, returns either a fresh
// LspClient or an error reason. Caller is responsible for storing it in the
// registry.
export async function spawnLspClient(
  params: LspStartParams,
): Promise<{ ok: true; client: LspClient } | LspStartFailure> {
  const result = await invoke<
    | { ok: true; key: string }
    | { ok: false; reason: string; hint?: string }
  >("lsp_start", { ...params } as Record<string, unknown>);

  if (!result.ok) return result;

  const client = new LspClient({
    key: result.key,
    lang: params.lang,
    projectId: params.projectId,
    projectPath: params.projectPath,
  });
  return { ok: true, client };
}
