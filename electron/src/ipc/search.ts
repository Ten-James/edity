import { ipcMain } from "electron";
import { spawn, spawnSync } from "child_process";
import * as path from "path";
import { rgPath } from "@vscode/ripgrep";

// --- File-name fuzzy search ----------------------------------------------
//
// Uses `git ls-files` to enumerate the project (drastically faster than
// walking the FS, and gitignore-aware out of the box). On the result we
// run a tiny subsequence-fuzzy matcher: every query character must appear
// in order in the path. Score is `negative match span` so tighter matches
// rank higher; basename matches get an additional bonus.

interface FuzzyFileResult {
  path: string;
  relPath: string;
  score: number;
  // Indices into the relative path of the matched query characters, used
  // for highlighting in the renderer.
  matchIndices: number[];
}

function fuzzyMatch(
  text: string,
  query: string,
): { score: number; indices: number[] } | null {
  if (!query) return { score: 0, indices: [] };
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi++;
    }
  }
  if (qi !== q.length) return null;
  // Score: smaller span = better. Add penalty for each gap.
  const span = indices[indices.length - 1] - indices[0] + 1;
  let consecutive = 0;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) consecutive++;
  }
  // Lower score = better; flip sign so callers can use ascending sort.
  return { score: span - consecutive * 2, indices };
}

function listProjectFiles(rootPath: string): string[] {
  try {
    const result = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      {
        cwd: rootPath,
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 10_000,
      },
    );
    if (result.status !== 0) return [];
    return result.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// --- File-content search (ripgrep) ---------------------------------------
//
// Spawns ripgrep with --json output and parses the streaming response. We
// keep one active rg process per renderer; on a new query we kill the
// previous one to avoid wasted work / out-of-order results.

interface ContentMatch {
  path: string;
  relPath: string;
  line: number;
  column: number;
  preview: string;
  matchRanges: Array<{ start: number; end: number }>;
}

let activeRgProcess: ReturnType<typeof spawn> | null = null;

function killActiveRg(): void {
  if (activeRgProcess && !activeRgProcess.killed) {
    try {
      activeRgProcess.kill();
    } catch {
      /* ignore */
    }
  }
  activeRgProcess = null;
}

function runRipgrep(
  rootPath: string,
  query: string,
  limit: number,
): Promise<ContentMatch[]> {
  return new Promise((resolve) => {
    killActiveRg();

    const args = [
      "--json",
      "--smart-case",
      "--max-count",
      "100",
      "--hidden",
      "--glob",
      "!.git/",
      "--glob",
      "!node_modules/",
      "--",
      query,
      ".",
    ];

    const proc = spawn(rgPath, args, { cwd: rootPath });
    activeRgProcess = proc;
    const matches: ContentMatch[] = [];
    let buffer = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line) as {
            type: string;
            data: unknown;
          };
          if (event.type === "match") {
            const data = event.data as {
              path: { text: string };
              lines: { text: string };
              line_number: number;
              absolute_offset: number;
              submatches: Array<{
                match: { text: string };
                start: number;
                end: number;
              }>;
            };
            const relPath = data.path.text;
            matches.push({
              path: path.isAbsolute(relPath)
                ? relPath
                : path.join(rootPath, relPath),
              relPath: path.isAbsolute(relPath)
                ? path.relative(rootPath, relPath)
                : relPath,
              line: data.line_number,
              column: (data.submatches[0]?.start ?? 0) + 1,
              preview: data.lines.text.replace(/\r?\n$/, ""),
              matchRanges: data.submatches.map((s) => ({
                start: s.start,
                end: s.end,
              })),
            });
            if (matches.length >= limit) {
              try {
                proc.kill();
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          // Skip malformed JSON lines (rg sometimes emits partial frames).
        }
      }
    });

    proc.on("error", () => {
      resolve(matches);
    });
    proc.on("close", () => {
      if (activeRgProcess === proc) activeRgProcess = null;
      resolve(matches);
    });
  });
}

export function registerSearchHandlers(): void {
  ipcMain.handle(
    "search_files_fuzzy",
    (
      _event,
      {
        rootPath,
        query,
        limit = 100,
      }: { rootPath: string; query: string; limit?: number },
    ): FuzzyFileResult[] => {
      const files = listProjectFiles(rootPath);
      if (files.length === 0) return [];
      if (!query.trim()) {
        // No query: return the first `limit` files in the order git gave us.
        return files.slice(0, limit).map((relPath) => ({
          path: path.join(rootPath, relPath),
          relPath,
          score: 0,
          matchIndices: [],
        }));
      }

      const results: FuzzyFileResult[] = [];
      for (const relPath of files) {
        // Try matching against the basename first (better UX), fall back to
        // the whole path.
        const basename = relPath.split("/").pop() ?? relPath;
        const baseMatch = fuzzyMatch(basename, query);
        const fullMatch = fuzzyMatch(relPath, query);
        if (!baseMatch && !fullMatch) continue;

        // Choose whichever yielded a result; if both, prefer basename match
        // and bias its score so it sorts above full-path matches.
        if (baseMatch) {
          // Re-anchor indices into the full relPath for highlighting.
          const baseStart = relPath.length - basename.length;
          results.push({
            path: path.join(rootPath, relPath),
            relPath,
            score: baseMatch.score - 100, // basename bonus
            matchIndices: baseMatch.indices.map((i) => i + baseStart),
          });
        } else if (fullMatch) {
          results.push({
            path: path.join(rootPath, relPath),
            relPath,
            score: fullMatch.score,
            matchIndices: fullMatch.indices,
          });
        }
      }

      results.sort((a, b) => a.score - b.score);
      return results.slice(0, limit);
    },
  );

  ipcMain.handle(
    "search_content",
    async (
      _event,
      {
        rootPath,
        query,
        limit = 200,
      }: { rootPath: string; query: string; limit?: number },
    ): Promise<ContentMatch[]> => {
      if (!query.trim()) return [];
      return runRipgrep(rootPath, query, limit);
    },
  );

  ipcMain.handle("search_content_cancel", () => {
    killActiveRg();
    return { ok: true };
  });
}
