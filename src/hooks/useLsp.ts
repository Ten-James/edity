// Orchestrates LSP binding for a Monaco editor instance opened on a file.
// Called from `useMonacoEditor.handleMount` — NOT a React hook itself (the
// Monaco onMount callback is not reactive and we want to keep the setup
// logic co-located with the LSP subsystem rather than scattered across the
// editor hook).

import { toast } from "sonner";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { detectLspLanguage } from "@/lib/lsp/lang-map";
import {
  detectServer,
  getOrStartClient,
  markHintShown,
} from "@/lib/lsp/registry";
import {
  registerLspProviders,
  bindDocumentToClient,
  unbindDocument,
  attachDiagnosticsHandler,
} from "@/lib/lsp/providers";
import { DocumentSyncSession } from "@/lib/lsp/document-sync";

// Tracks per-editor cleanup so unmount can dispose the sync session + any
// side effects (diagnostics subscription) we added for this specific file.
export interface LspAttachment {
  dispose(): void;
}

// Diagnostics subscribers are per-client, but we only want one per client —
// otherwise each file would re-add the handler. Keyed by client key.
const diagnosticsSubscribers = new Set<string>();

export interface AttachLspOptions {
  monaco: Monaco;
  editor: editor.IStandaloneCodeEditor;
  model: editor.ITextModel;
  filePath: string;
  projectId: string;
  projectPath: string;
}

export async function attachLsp(
  opts: AttachLspOptions,
): Promise<LspAttachment | null> {
  const lspLang = detectLspLanguage(opts.filePath);
  if (!lspLang) return null;

  // Detect server availability first so we can show a hint without even
  // attempting to spawn.
  const detection = await detectServer(lspLang);
  if (!detection.available) {
    const serverName = detection.serverName ?? lspLang;
    if (markHintShown(serverName)) {
      toast.warning(`LSP (${serverName}) not available`, {
        description: detection.installHint,
        duration: 8000,
      });
    }
    return null;
  }

  const startResult = await getOrStartClient({
    projectId: opts.projectId,
    projectPath: opts.projectPath,
    lang: lspLang,
    filePath: opts.filePath,
  });

  if (!startResult.ok) {
    if (startResult.hint && markHintShown(startResult.reason)) {
      toast.warning("LSP server failed to start", {
        description: startResult.hint,
      });
    } else {
      console.warn("[lsp] failed to start:", startResult.reason);
    }
    return null;
  }

  const client = startResult.client;

  // Register Monaco providers lazily for the languages we've seen so far.
  // Idempotent — providers.ts tracks which Monaco language IDs are already
  // registered and skips.
  registerLspProviders({ monaco: opts.monaco, languages: [lspLang] });

  // Hook up diagnostics once per client.
  if (!diagnosticsSubscribers.has(client.key)) {
    diagnosticsSubscribers.add(client.key);
    attachDiagnosticsHandler(opts.monaco, client);
  }

  // Bind this Monaco model to the client so the providers can look up
  // context by model URI, and start the didOpen/didChange sync loop.
  bindDocumentToClient(opts.model, client, lspLang);
  const sync = new DocumentSyncSession({
    client,
    model: opts.model,
    filePath: opts.filePath,
    lspLanguageId: lspLang,
  });
  sync.start();

  return {
    dispose() {
      sync.dispose();
      unbindDocument(opts.model);
    },
  };
}
