// File extension → LSP language ID. Distinct from `src/lib/languages.ts` which
// maps to Monaco language IDs — LSP requires JSX/TSX to be tagged separately
// (`javascriptreact` / `typescriptreact`) so that servers like vtsls enable
// the right grammar branch.

export type LspLanguageId =
  | "c"
  | "cpp"
  | "go"
  | "rust"
  | "javascript"
  | "javascriptreact"
  | "typescript"
  | "typescriptreact"
  | "markdown";

const EXT_TO_LSP_LANG: Record<string, LspLanguageId> = {
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  go: "go",
  rs: "rust",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
};

export function detectLspLanguage(filePath: string): LspLanguageId | null {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const ext = name.split(".").pop() ?? "";
  return EXT_TO_LSP_LANG[ext] ?? null;
}

// LSP language ID → corresponding Monaco language ID. Used when registering
// providers; Monaco doesn't know `javascriptreact` so we map it back.
const LSP_TO_MONACO: Record<LspLanguageId, string> = {
  c: "c",
  cpp: "cpp",
  go: "go",
  rust: "rust",
  javascript: "javascript",
  javascriptreact: "javascript",
  typescript: "typescript",
  typescriptreact: "typescript",
  markdown: "markdown",
};

export function lspLangToMonacoLang(lang: LspLanguageId): string {
  return LSP_TO_MONACO[lang];
}
