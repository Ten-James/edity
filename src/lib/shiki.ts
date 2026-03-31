import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const PRELOADED_LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "html",
  "css",
  "rust",
  "python",
  "markdown",
  "yaml",
  "toml",
  "bash",
  "sql",
  "go",
  "java",
  "c",
  "cpp",
] as const;

const PRELOADED_THEMES = [
  "github-dark",
  "github-light",
  "catppuccin-latte",
  "catppuccin-frappe",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "rose-pine",
  "rose-pine-moon",
  "rose-pine-dawn",
  "tokyo-night",
  "dracula",
  "nord",
  "gruvbox-dark-medium",
  "gruvbox-light-medium",
  "one-dark-pro",
  "solarized-dark",
  "solarized-light",
] as const;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...PRELOADED_THEMES],
      langs: [...PRELOADED_LANGS],
    });
  }
  return highlighterPromise;
}

export async function ensureShikiTheme(themeName: string): Promise<void> {
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedThemes();
  if (!loaded.includes(themeName as never)) {
    try {
      await highlighter.loadTheme(themeName as never);
    } catch {
      // Theme not available in shiki, will fall back
    }
  }
}

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  rs: "rust",
  py: "python",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  sql: "sql",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  swift: "swift",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  xml: "html",
  svg: "html",
};

export function detectLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}
