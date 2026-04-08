// Converters between LSP wire types and Monaco editor types. We talk LSP 3.17
// (UTF-16 position encoding negotiated by client capabilities), and Monaco
// also uses UTF-16 internally so positions translate directly with a 1-line
// off-by-one (LSP is 0-based, Monaco is 1-based).

import type { editor, languages, IRange, IMarkdownString } from "monaco-editor";
import type * as lsp from "vscode-languageserver-protocol";
import { uriToPath } from "./uri";

// --- Position / Range ---

export function lspPosToMonaco(pos: lsp.Position): { lineNumber: number; column: number } {
  return { lineNumber: pos.line + 1, column: pos.character + 1 };
}

export function lspRangeToMonaco(range: lsp.Range): IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

export function monacoPosToLsp(pos: { lineNumber: number; column: number }): lsp.Position {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

// --- Diagnostics ---

const SEVERITY_TO_MARKER: Record<number, number> = {
  // monaco's MarkerSeverity: Hint=1, Info=2, Warning=4, Error=8
  1: 8, // LSP Error
  2: 4, // LSP Warning
  3: 2, // LSP Information
  4: 1, // LSP Hint
};

export function lspDiagnosticToMonaco(
  diag: lsp.Diagnostic,
): editor.IMarkerData {
  let codeValue: string | undefined;
  if (typeof diag.code === "string") codeValue = diag.code;
  else if (typeof diag.code === "number") codeValue = String(diag.code);
  else if (diag.code && typeof diag.code === "object" && "value" in diag.code) {
    codeValue = String((diag.code as { value: string | number }).value);
  }
  return {
    severity: SEVERITY_TO_MARKER[diag.severity ?? 1] ?? 8,
    message: diag.message,
    source: diag.source,
    code: codeValue,
    startLineNumber: diag.range.start.line + 1,
    startColumn: diag.range.start.character + 1,
    endLineNumber: diag.range.end.line + 1,
    endColumn: diag.range.end.character + 1,
    tags: diag.tags as number[] | undefined,
  };
}

// --- Markdown / hover content ---

export function lspMarkupToMonaco(
  content:
    | lsp.MarkupContent
    | lsp.MarkedString
    | lsp.MarkedString[]
    | string
    | undefined,
): IMarkdownString[] {
  if (!content) return [];
  if (typeof content === "string") return [{ value: content }];
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (typeof c === "string") return { value: c };
      // MarkedString as { language, value }
      return { value: "```" + c.language + "\n" + c.value + "\n```" };
    });
  }
  // MarkupContent
  if ("kind" in content) {
    return [{ value: content.value }];
  }
  // MarkedString as object
  return [{ value: "```" + content.language + "\n" + content.value + "\n```" }];
}

// --- CompletionItem ---

// Monaco's CompletionItemKind enum values (as numbers, since we can't import
// the enum without pulling Monaco at module-eval time).
const LSP_TO_MONACO_COMPLETION_KIND: Record<number, number> = {
  1: 17, // Text
  2: 0, // Method
  3: 1, // Function
  4: 2, // Constructor
  5: 3, // Field
  6: 4, // Variable
  7: 5, // Class
  8: 7, // Interface
  9: 8, // Module
  10: 9, // Property
  11: 12, // Unit
  12: 13, // Value
  13: 15, // Enum
  14: 17, // Keyword
  15: 27, // Snippet
  16: 19, // Color
  17: 20, // File
  18: 21, // Reference
  19: 23, // Folder
  20: 16, // EnumMember
  21: 14, // Constant
  22: 6, // Struct
  23: 10, // Event
  24: 11, // Operator
  25: 24, // TypeParameter
};

export function lspCompletionToMonaco(
  item: lsp.CompletionItem,
  defaultRange: IRange,
): languages.CompletionItem {
  const labelText =
    typeof item.label === "string"
      ? item.label
      : (item.label as { label: string }).label;

  const textEdit = item.textEdit as
    | { newText: string; range?: lsp.Range; insert?: lsp.Range; replace?: lsp.Range }
    | undefined;

  const insertText = textEdit?.newText ?? item.insertText ?? labelText;

  let range: IRange = defaultRange;
  if (textEdit) {
    if (textEdit.range) {
      range = lspRangeToMonaco(textEdit.range);
    } else if (textEdit.insert) {
      range = lspRangeToMonaco(textEdit.insert);
    }
  }

  // Monaco needs `insertTextRules: 4` (InsertAsSnippet) when the LSP item is
  // a snippet (insertTextFormat = 2).
  const isSnippet = item.insertTextFormat === 2;

  return {
    label: labelText,
    kind: LSP_TO_MONACO_COMPLETION_KIND[item.kind ?? 1] ?? 17,
    insertText,
    insertTextRules: isSnippet ? 4 : undefined,
    detail: item.detail,
    documentation: item.documentation
      ? typeof item.documentation === "string"
        ? item.documentation
        : { value: item.documentation.value }
      : undefined,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    commitCharacters: item.commitCharacters,
    range,
    tags: item.tags as number[] | undefined,
  };
}

// --- Definition / Location ---

// Converts an LSP Location/LocationLink to the shape Monaco expects. Since
// constructing `monaco.Uri` requires a runtime reference to Monaco, we accept
// a Uri factory injected by the caller (usually bound in provider setup
// using the monaco instance passed to handleMount).
export type UriFactory = (fsPath: string) => import("monaco-editor").Uri;

export function lspLocationToMonaco(
  loc: lsp.Location | lsp.LocationLink,
  makeUri: UriFactory,
): languages.Location {
  if ("targetUri" in loc) {
    return {
      uri: makeUri(uriToPath(loc.targetUri)),
      range: lspRangeToMonaco(loc.targetSelectionRange ?? loc.targetRange),
    };
  }
  return {
    uri: makeUri(uriToPath(loc.uri)),
    range: lspRangeToMonaco(loc.range),
  };
}

// --- Symbols ---

const SYMBOL_KIND_TO_MONACO: Record<number, number> = {
  // Monaco SymbolKind enum values (numbers from 0)
  1: 4, // File
  2: 1, // Module
  3: 2, // Namespace
  4: 3, // Package
  5: 4, // Class
  6: 5, // Method
  7: 6, // Property
  8: 7, // Field
  9: 8, // Constructor
  10: 9, // Enum
  11: 10, // Interface
  12: 11, // Function
  13: 12, // Variable
  14: 13, // Constant
  15: 14, // String
  16: 15, // Number
  17: 16, // Boolean
  18: 17, // Array
  19: 18, // Object
  20: 19, // Key
  21: 20, // Null
  22: 21, // EnumMember
  23: 22, // Struct
  24: 23, // Event
  25: 24, // Operator
  26: 25, // TypeParameter
};

export function lspSymbolKindToMonaco(kind: number): number {
  return SYMBOL_KIND_TO_MONACO[kind] ?? 0;
}

// Convert LSP DocumentSymbol (hierarchical) to flat list with names.
export interface FlatSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: IRange;
  selectionRange: IRange;
  containerName?: string;
}

export function flattenDocumentSymbols(
  symbols: lsp.DocumentSymbol[],
  containerName?: string,
): FlatSymbol[] {
  const out: FlatSymbol[] = [];
  for (const sym of symbols) {
    out.push({
      name: sym.name,
      detail: sym.detail,
      kind: sym.kind,
      range: lspRangeToMonaco(sym.range),
      selectionRange: lspRangeToMonaco(sym.selectionRange),
      containerName,
    });
    if (sym.children?.length) {
      out.push(...flattenDocumentSymbols(sym.children, sym.name));
    }
  }
  return out;
}
