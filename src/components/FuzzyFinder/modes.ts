// Per-mode search implementations. Each function is pure async and returns
// a list of FuzzyResult. The dialog debounces queries on the caller side.

import { invoke } from "@/lib/ipc";
import { getAllClientsForProject, getClient } from "@/lib/lsp/registry";
import { detectLspLanguage } from "@/lib/lsp/lang-map";
import { lspRangeToMonaco, flattenDocumentSymbols } from "@/lib/lsp/converters";
import { uriToPath, pathToUri } from "@/lib/lsp/uri";
import type * as lsp from "vscode-languageserver-protocol";
import type {
  FuzzyFileResult,
  FuzzyContentResult,
  FuzzySymbolResult,
} from "./types";
import * as path from "path";

interface BackendFileHit {
  path: string;
  relPath: string;
  score: number;
  matchIndices: number[];
}

export async function searchFiles(
  rootPath: string,
  query: string,
): Promise<FuzzyFileResult[]> {
  const results = await invoke<BackendFileHit[]>("search_files_fuzzy", {
    rootPath,
    query,
    limit: 200,
  });
  return results.map((r) => ({
    kind: "file",
    path: r.path,
    relPath: r.relPath,
    matchIndices: r.matchIndices,
  }));
}

interface BackendContentHit {
  path: string;
  relPath: string;
  line: number;
  column: number;
  preview: string;
  matchRanges: Array<{ start: number; end: number }>;
}

export async function searchContent(
  rootPath: string,
  query: string,
): Promise<FuzzyContentResult[]> {
  if (!query.trim()) return [];
  const results = await invoke<BackendContentHit[]>("search_content", {
    rootPath,
    query,
    limit: 200,
  });
  return results.map((r) => ({
    kind: "content",
    path: r.path,
    relPath: r.relPath,
    line: r.line,
    column: r.column,
    preview: r.preview,
    matchRanges: r.matchRanges,
  }));
}

export async function cancelContentSearch(): Promise<void> {
  await invoke("search_content_cancel").catch(() => {});
}

// --- Workspace symbols (across all LSP servers for the active project) ---

export async function searchWorkspaceSymbols(
  projectId: string,
  projectPath: string,
  query: string,
): Promise<FuzzySymbolResult[]> {
  const clients = getAllClientsForProject(projectId);
  if (clients.length === 0) return [];

  // Run all servers in parallel. Each returns at most 100 symbols; combined
  // and capped at 200 for display.
  const responses = await Promise.all(
    clients.map((client) =>
      client
        .sendRequest<lsp.SymbolInformation[] | lsp.WorkspaceSymbol[] | null>(
          "workspace/symbol",
          { query },
        )
        .catch(() => null),
    ),
  );

  const out: FuzzySymbolResult[] = [];
  for (const response of responses) {
    if (!response) continue;
    for (const sym of response) {
      // SymbolInformation has `location: Location`. WorkspaceSymbol may have
      // either a full Location or `{ uri }` only; in the latter case we'd
      // need a resolve round-trip, which we skip here.
      const location = (sym as lsp.SymbolInformation).location;
      if (!location || !("range" in location)) continue;
      const uri = location.uri;
      const fsPath = uriToPath(uri);
      const relPath = path.relative(projectPath, fsPath);
      const range = lspRangeToMonaco(location.range);
      out.push({
        kind: "symbol",
        name: sym.name,
        containerName: (sym as lsp.SymbolInformation).containerName,
        symbolKind: sym.kind,
        path: fsPath,
        relPath,
        line: range.startLineNumber,
        column: range.startColumn,
      });
    }
  }
  return out.slice(0, 200);
}

// --- Buffer symbols (documentSymbol on the currently-active file) ---

export async function searchBufferSymbols(
  projectId: string,
  filePath: string,
  query: string,
): Promise<FuzzySymbolResult[]> {
  const lang = detectLspLanguage(filePath);
  if (!lang) return [];
  const client = getClient(projectId, lang);
  if (!client) return [];

  const result = await client.sendRequest<
    lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null
  >("textDocument/documentSymbol", {
    textDocument: { uri: pathToUri(filePath) },
  });
  if (!result || result.length === 0) return [];

  const relPath = filePath;
  let symbols: FuzzySymbolResult[];

  // DocumentSymbol (hierarchical) vs SymbolInformation discriminator.
  if ("selectionRange" in result[0]) {
    const flat = flattenDocumentSymbols(result as lsp.DocumentSymbol[]);
    symbols = flat.map((sym) => ({
      kind: "symbol" as const,
      name: sym.name,
      containerName: sym.containerName,
      symbolKind: sym.kind,
      path: filePath,
      relPath,
      line: sym.selectionRange.startLineNumber,
      column: sym.selectionRange.startColumn,
    }));
  } else {
    symbols = (result as lsp.SymbolInformation[]).map((sym) => {
      const range = lspRangeToMonaco(sym.location.range);
      return {
        kind: "symbol" as const,
        name: sym.name,
        containerName: sym.containerName,
        symbolKind: sym.kind,
        path: filePath,
        relPath,
        line: range.startLineNumber,
        column: range.startColumn,
      };
    });
  }

  if (!query.trim()) return symbols.slice(0, 200);

  // Local fuzzy filtering — doesn't need a ripgrep round-trip.
  const q = query.toLowerCase();
  return symbols
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 200);
}
