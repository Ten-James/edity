// Wires up Monaco language providers (completion, hover, definition,
// references, document symbols, signature help) to call the LSP client.
// Returns a disposer that unregisters everything.
//
// Providers are registered ONCE per (Monaco language id) for the lifetime of
// the Monaco instance. The provider closures look up the active LSP client
// from the registry, so they automatically pick up whichever client is
// currently bound to a given file.

import type { Monaco } from "@monaco-editor/react";
import type { editor, IDisposable, Position } from "monaco-editor";
import type * as lsp from "vscode-languageserver-protocol";
import {
  lspCompletionToMonaco,
  lspDiagnosticToMonaco,
  lspLocationToMonaco,
  lspMarkupToMonaco,
  lspRangeToMonaco,
  lspSymbolKindToMonaco,
  monacoPosToLsp,
  flattenDocumentSymbols,
} from "./converters";
import type { LspLanguageId } from "./lang-map";
import { lspLangToMonacoLang } from "./lang-map";
import { uriToPath, pathToUri } from "./uri";
import type { LspClient } from "./client";

// Marker owner used so we can clear stale diagnostics on the right model.
const MARKER_OWNER = "edity-lsp";

// Find the LSP client that owns a given Monaco model. We resolve based on
// the model's filePath (model.uri.fsPath) and the active project. Since
// providers run inside Monaco's evaluation, we cannot pass the project — we
// stash it on the model URI when registering for the document.
//
// To avoid plumbing project context through providers, we maintain a small
// reverse map from `model URI string` -> `{client, lang}` populated by the
// document sync session.

interface BoundDocument {
  client: LspClient;
  lspLang: LspLanguageId;
  // True once we've sent didOpen and the model is ready for requests.
  ready: boolean;
}

const modelBindings = new Map<string, BoundDocument>();

export function bindDocumentToClient(
  model: editor.ITextModel,
  client: LspClient,
  lspLang: LspLanguageId,
): void {
  modelBindings.set(model.uri.toString(), { client, lspLang, ready: true });
}

export function unbindDocument(model: editor.ITextModel): void {
  modelBindings.delete(model.uri.toString());
}

function getBindingForModel(model: editor.ITextModel): BoundDocument | null {
  return modelBindings.get(model.uri.toString()) ?? null;
}

// Resolve LSP client for a given file URI string (used by definition jumps
// where the destination model may not exist yet). Falls back to scanning
// existing bindings.
function getClientForUri(uri: string): LspClient | null {
  const binding = modelBindings.get(uri);
  if (binding) return binding.client;
  return null;
}

// --- Provider registration ---

interface RegisterOptions {
  monaco: Monaco;
  // Languages we have at least one document for. Each maps to a backend
  // server we know about.
  languages: LspLanguageId[];
}

const REGISTERED_LANGS = new Set<string>();
const disposables: IDisposable[] = [];

export function registerLspProviders(opts: RegisterOptions): void {
  const { monaco } = opts;
  const makeUri = (fsPath: string) => monaco.Uri.file(fsPath);

  for (const lspLang of opts.languages) {
    const monacoLang = lspLangToMonacoLang(lspLang);
    if (REGISTERED_LANGS.has(monacoLang)) continue;
    REGISTERED_LANGS.add(monacoLang);

    // Completion
    disposables.push(
      monaco.languages.registerCompletionItemProvider(monacoLang, {
        triggerCharacters: [
          ".", ":", "(", "<", "\"", "'", "/", "@", "*", "&", "$", " ",
        ],
        async provideCompletionItems(model: editor.ITextModel, position: Position) {
          const binding = getBindingForModel(model);
          if (!binding) return { suggestions: [] };
          const word = model.getWordUntilPosition(position);
          const defaultRange: import("monaco-editor").IRange = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };
          const result = await binding.client.sendRequest<
            lsp.CompletionList | lsp.CompletionItem[] | null
          >("textDocument/completion", {
            textDocument: { uri: model.uri.toString() },
            position: monacoPosToLsp(position),
            context: { triggerKind: 1 },
          });
          if (!result) return { suggestions: [] };
          const items = Array.isArray(result) ? result : result.items;
          return {
            suggestions: items.map((item) =>
              lspCompletionToMonaco(item, defaultRange),
            ),
            incomplete: !Array.isArray(result) ? result.isIncomplete : false,
          };
        },
      }),
    );

    // Hover
    disposables.push(
      monaco.languages.registerHoverProvider(monacoLang, {
        async provideHover(model: editor.ITextModel, position: Position) {
          const binding = getBindingForModel(model);
          if (!binding) return null;
          const result = await binding.client.sendRequest<lsp.Hover | null>(
            "textDocument/hover",
            {
              textDocument: { uri: model.uri.toString() },
              position: monacoPosToLsp(position),
            },
          );
          if (!result) return null;
          return {
            contents: lspMarkupToMonaco(result.contents),
            range: result.range ? lspRangeToMonaco(result.range) : undefined,
          };
        },
      }),
    );

    // Definition (F12 / Cmd+Click)
    disposables.push(
      monaco.languages.registerDefinitionProvider(monacoLang, {
        async provideDefinition(model: editor.ITextModel, position: Position) {
          const binding = getBindingForModel(model);
          if (!binding) return null;
          const result = await binding.client.sendRequest<
            lsp.Location | lsp.Location[] | lsp.LocationLink[] | null
          >("textDocument/definition", {
            textDocument: { uri: model.uri.toString() },
            position: monacoPosToLsp(position),
          });
          if (!result) return null;
          const arr = Array.isArray(result) ? result : [result];
          return arr.map((loc) => lspLocationToMonaco(loc, makeUri));
        },
      }),
    );

    // References (Shift+F12)
    disposables.push(
      monaco.languages.registerReferenceProvider(monacoLang, {
        async provideReferences(model: editor.ITextModel, position: Position) {
          const binding = getBindingForModel(model);
          if (!binding) return null;
          const result = await binding.client.sendRequest<lsp.Location[] | null>(
            "textDocument/references",
            {
              textDocument: { uri: model.uri.toString() },
              position: monacoPosToLsp(position),
              context: { includeDeclaration: true },
            },
          );
          if (!result) return null;
          return result.map((loc) => lspLocationToMonaco(loc, makeUri));
        },
      }),
    );

    // Document symbols (used by Ctrl+Shift+O peek and our buffer-symbol
    // fuzzy mode).
    disposables.push(
      monaco.languages.registerDocumentSymbolProvider(monacoLang, {
        displayName: "LSP",
        async provideDocumentSymbols(model: editor.ITextModel) {
          const binding = getBindingForModel(model);
          if (!binding) return [];
          const result = await binding.client.sendRequest<
            lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null
          >("textDocument/documentSymbol", {
            textDocument: { uri: model.uri.toString() },
          });
          if (!result || result.length === 0) return [];

          // DocumentSymbol or SymbolInformation? Discriminate by `selectionRange`.
          if ("selectionRange" in result[0]) {
            const flat = flattenDocumentSymbols(result as lsp.DocumentSymbol[]);
            return flat.map((sym) => ({
              name: sym.name,
              detail: sym.detail ?? "",
              kind: lspSymbolKindToMonaco(sym.kind),
              tags: [],
              range: sym.range,
              selectionRange: sym.selectionRange,
              containerName: sym.containerName,
            }));
          }
          return (result as lsp.SymbolInformation[]).map((sym) => ({
            name: sym.name,
            detail: "",
            kind: lspSymbolKindToMonaco(sym.kind),
            tags: [],
            range: lspRangeToMonaco(sym.location.range),
            selectionRange: lspRangeToMonaco(sym.location.range),
            containerName: sym.containerName,
          }));
        },
      }),
    );

    // Signature help
    disposables.push(
      monaco.languages.registerSignatureHelpProvider(monacoLang, {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],
        async provideSignatureHelp(model: editor.ITextModel, position: Position) {
          const binding = getBindingForModel(model);
          if (!binding) return null;
          const result = await binding.client.sendRequest<lsp.SignatureHelp | null>(
            "textDocument/signatureHelp",
            {
              textDocument: { uri: model.uri.toString() },
              position: monacoPosToLsp(position),
            },
          );
          if (!result || result.signatures.length === 0) return null;
          return {
            value: {
              signatures: result.signatures.map((sig) => ({
                label: sig.label,
                documentation: sig.documentation
                  ? typeof sig.documentation === "string"
                    ? sig.documentation
                    : { value: sig.documentation.value }
                  : undefined,
                parameters: (sig.parameters ?? []).map((p) => ({
                  label: p.label as string | [number, number],
                  documentation: p.documentation
                    ? typeof p.documentation === "string"
                      ? p.documentation
                      : { value: p.documentation.value }
                    : undefined,
                })),
                activeParameter: sig.activeParameter,
              })),
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose() {},
          };
        },
      }),
    );
  }
}

// Subscribe a client's `publishDiagnostics` notifications and apply them to
// matching Monaco models. Caller is responsible for disposing the returned
// unsubscribe.
export function attachDiagnosticsHandler(
  monaco: Monaco,
  client: LspClient,
): () => void {
  return client.onNotification("textDocument/publishDiagnostics", (params) => {
    const p = params as { uri: string; diagnostics: lsp.Diagnostic[] };
    const fsPath = uriToPath(p.uri);
    const model = monaco.editor.getModel(monaco.Uri.file(fsPath));
    if (!model) return;
    const markers = p.diagnostics.map(lspDiagnosticToMonaco);
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  });
}

export function clearAllProviders(): void {
  for (const d of disposables) {
    try {
      d.dispose();
    } catch {
      /* ignore */
    }
  }
  disposables.length = 0;
  REGISTERED_LANGS.clear();
  modelBindings.clear();
}

// Export for the document sync module / fuzzy finder symbol mode.
export { getBindingForModel, getClientForUri };

// Re-export for symmetry with `bindDocumentToClient`.
export { pathToUri };
