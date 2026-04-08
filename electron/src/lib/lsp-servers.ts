import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

export type LspLanguage =
  | "c"
  | "cpp"
  | "go"
  | "rust"
  | "javascript"
  | "javascriptreact"
  | "typescript"
  | "typescriptreact"
  | "markdown";

export interface LspServerConfig {
  // The language IDs this server handles. The first entry is also the
  // canonical key under which we group servers (e.g. all C/C++ files share
  // a single clangd instance).
  languages: LspLanguage[];
  // Binary name to look up on PATH (no extension).
  binary: string;
  // Arguments passed to the server on startup.
  args: string[];
  // Marker file used to find the workspace root for this server. The first
  // ancestor directory containing the marker is used as `rootUri`. If no
  // marker matches we fall back to the project root.
  rootMarkers: string[];
  // Hint shown to the user if the binary is missing from PATH.
  installHint: string;
  // Optional initializationOptions sent in `initialize`.
  initializationOptions?: Record<string, unknown>;
}

export const LSP_SERVERS: Record<string, LspServerConfig> = {
  clangd: {
    languages: ["c", "cpp"],
    binary: "clangd",
    args: ["--background-index", "--clang-tidy", "--header-insertion=iwyu"],
    rootMarkers: ["compile_commands.json", "compile_flags.txt", ".clangd"],
    installHint:
      "clangd not found. Install with: brew install llvm (macOS) or apt install clangd (Linux)",
  },
  gopls: {
    languages: ["go"],
    binary: "gopls",
    args: ["serve"],
    rootMarkers: ["go.mod", "go.work"],
    installHint:
      "gopls not found. Install with: go install golang.org/x/tools/gopls@latest",
  },
  "rust-analyzer": {
    languages: ["rust"],
    binary: "rust-analyzer",
    args: [],
    rootMarkers: ["Cargo.toml"],
    installHint:
      "rust-analyzer not found. Install with: rustup component add rust-analyzer",
  },
  vtsls: {
    languages: [
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ],
    binary: "vtsls",
    args: ["--stdio"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint:
      "vtsls not found. Install with: npm i -g @vtsls/language-server (or 'typescript-language-server' as a fallback)",
  },
  marksman: {
    languages: ["markdown"],
    binary: "marksman",
    args: ["server"],
    rootMarkers: [".marksman.toml"],
    installHint: "marksman not found. Install with: brew install marksman",
  },
};

// Reverse map: language ID -> server name
export const LANG_TO_SERVER: Record<LspLanguage, string> = (() => {
  const out = {} as Record<LspLanguage, string>;
  for (const [serverName, cfg] of Object.entries(LSP_SERVERS)) {
    for (const lang of cfg.languages) out[lang] = serverName;
  }
  return out;
})();

const detectionCache = new Map<string, string | null>();

// Locate the binary on PATH. Returns absolute path or null. Cached for the
// lifetime of the process — install/uninstall during a session is rare and
// the user can always restart.
export function locateBinary(binary: string): string | null {
  if (detectionCache.has(binary)) return detectionCache.get(binary) ?? null;

  // `which` works on macOS/Linux; on Windows we'd want `where`. Edity is
  // primarily macOS so this is acceptable.
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(lookup, [binary], {
      encoding: "utf-8",
      timeout: 3000,
    });
    if (result.status === 0) {
      const found = result.stdout.split(/\r?\n/)[0]?.trim() || null;
      detectionCache.set(binary, found);
      return found;
    }
  } catch {
    // ignore
  }
  detectionCache.set(binary, null);
  return null;
}

// Walk upward from `startDir` (inclusive) until we find a directory that
// contains any of the `markers`. Stops at `boundary` (project root). Returns
// `boundary` if no marker matches.
export function findRootDir(
  startDir: string,
  markers: string[],
  boundary: string,
): string {
  let current = path.resolve(startDir);
  const stop = path.resolve(boundary);
  while (true) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(current, marker))) return current;
    }
    if (current === stop) return stop;
    const parent = path.dirname(current);
    if (parent === current) return stop;
    if (!current.startsWith(stop)) return stop;
    current = parent;
  }
}

export function getServerConfigForLanguage(
  lang: LspLanguage,
): { name: string; config: LspServerConfig } | null {
  const serverName = LANG_TO_SERVER[lang];
  if (!serverName) return null;
  const config = LSP_SERVERS[serverName];
  if (!config) return null;
  return { name: serverName, config };
}
