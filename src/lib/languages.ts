/** Canonical file-extension → language-id mapping shared by Monaco and Shiki. */
export const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  lua: "lua",
  r: "r",
  dart: "dart",
  vue: "html",
  svelte: "html",
};

/** Language remap for Shiki (which uses different identifiers for some languages). */
const SHIKI_OVERRIDES: Record<string, string> = {
  shell: "bash",
  ini: "toml",
  csharp: "c",
  scss: "css",
  less: "css",
  xml: "html",
};

export function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile" || name === "gnumakefile") return "makefile";
  const ext = name.split(".").pop() ?? "";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

export function detectShikiLanguage(filePath: string): string {
  const lang = detectLanguage(filePath);
  if (lang === "plaintext") return "text";
  return SHIKI_OVERRIDES[lang] ?? lang;
}
