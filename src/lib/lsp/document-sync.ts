// Bridges Monaco editor models to LSP textDocument/* notifications.
// One `DocumentSyncSession` per (model, client). It owns the model content
// version counter and the subscription that fires `didChange` on edits.

import type { editor, IDisposable } from "monaco-editor";
import type { LspClient } from "./client";
import type { LspLanguageId } from "./lang-map";

export interface DocumentSyncOptions {
  client: LspClient;
  model: editor.ITextModel;
  filePath: string;
  lspLanguageId: LspLanguageId;
  // Milliseconds to coalesce didChange events. 100ms matches VS Code default.
  debounceMs?: number;
}

export class DocumentSyncSession {
  private readonly client: LspClient;
  private readonly model: editor.ITextModel;
  private readonly uri: string;
  private readonly lspLang: LspLanguageId;
  private readonly debounceMs: number;

  private version = 1;
  private didOpenSent = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFullContent: string | null = null;
  private subscription: IDisposable | null = null;
  private disposed = false;

  constructor(opts: DocumentSyncOptions) {
    this.client = opts.client;
    this.model = opts.model;
    // Use the model's own URI string so it round-trips identically through
    // the providers (which look up bindings keyed by model.uri.toString())
    // and the diagnostics handler (which looks up models by file path).
    this.uri = opts.model.uri.toString();
    this.lspLang = opts.lspLanguageId;
    this.debounceMs = opts.debounceMs ?? 100;
  }

  start(): void {
    // Fire didOpen immediately. Servers need this before they answer any
    // completion/hover/definition requests for the document.
    this.sendDidOpen();
    // Coalesce every content change into a debounced `didChange`. We use
    // `Full` sync (type 1) since that is supported by every server and
    // avoids subtle off-by-one bugs in incremental sync. For small-to-medium
    // files the overhead is negligible.
    this.subscription = this.model.onDidChangeContent(() => {
      if (this.disposed) return;
      this.pendingFullContent = this.model.getValue();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.flushDidChange();
      }, this.debounceMs);
    });
  }

  private sendDidOpen(): void {
    if (this.didOpenSent) return;
    this.didOpenSent = true;
    this.client.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: this.uri,
        languageId: this.lspLang,
        version: this.version,
        text: this.model.getValue(),
      },
    });
  }

  private flushDidChange(): void {
    if (this.disposed || !this.pendingFullContent) {
      this.debounceTimer = null;
      return;
    }
    this.version += 1;
    this.client.sendNotification("textDocument/didChange", {
      textDocument: { uri: this.uri, version: this.version },
      contentChanges: [{ text: this.pendingFullContent }],
    });
    this.pendingFullContent = null;
    this.debounceTimer = null;
  }

  // Force flush any pending change immediately — useful before issuing a
  // request that depends on up-to-date server state (e.g. completion).
  flushNow(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.flushDidChange();
    }
  }

  getUri(): string {
    return this.uri;
  }

  getVersion(): number {
    return this.version;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.subscription) {
      try {
        this.subscription.dispose();
      } catch {
        /* ignore */
      }
    }
    if (this.didOpenSent) {
      this.client.sendNotification("textDocument/didClose", {
        textDocument: { uri: this.uri },
      });
    }
  }
}
