import { createHighlighter, type Highlighter } from "shiki";
import { detectShikiLanguage } from "@/lib/languages";

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

export const detectLang = detectShikiLanguage;
