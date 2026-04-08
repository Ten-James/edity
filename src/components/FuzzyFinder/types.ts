// Shared types for the fuzzy finder dialog.

export type FuzzyMode = "files" | "content" | "symbols" | "buffer";

export interface FuzzyFileResult {
  kind: "file";
  path: string; // absolute
  relPath: string;
  matchIndices: number[];
}

export interface FuzzyContentResult {
  kind: "content";
  path: string; // absolute
  relPath: string;
  line: number; // 1-based
  column: number; // 1-based
  preview: string;
  matchRanges: Array<{ start: number; end: number }>;
}

export interface FuzzySymbolResult {
  kind: "symbol";
  name: string;
  containerName?: string;
  symbolKind: number; // LSP SymbolKind (1..26)
  // Workspace symbols carry a target location; buffer symbols just need the
  // local position.
  path: string; // absolute
  relPath: string;
  line: number; // 1-based
  column: number; // 1-based
}

export type FuzzyResult =
  | FuzzyFileResult
  | FuzzyContentResult
  | FuzzySymbolResult;
