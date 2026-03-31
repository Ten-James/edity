import { execFileSync } from "child_process";
import type { GitFileStatus } from "../../../shared/types/ipc";

interface GitResult {
  ok: boolean;
  output?: string;
  error?: string;
}

export function execGit(args: string[], cwd: string, timeout = 15000): GitResult {
  try {
    const result = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, output: result.trimEnd() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string };
    return { ok: false, error: e.stderr?.trim() || e.message };
  }
}

export function parseGitStatus(output: string): GitFileStatus[] {
  if (!output) return [];
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const rest = line.slice(3);
      const parts = rest.split(" -> ");
      return {
        path: parts.length > 1 ? parts[1] : parts[0],
        indexStatus,
        workTreeStatus,
        originalPath: parts.length > 1 ? parts[0] : undefined,
      };
    });
}
