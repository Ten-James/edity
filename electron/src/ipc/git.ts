import * as fs from "fs";
import * as path from "path";
import { ipcMain } from "electron";
import { execGit, parseGitStatus } from "../lib/git-helpers";

export function registerGitHandlers(): void {
  ipcMain.handle("git_status", (_event, { cwd }: { cwd: string }) => {
    const result = execGit(["status", "--porcelain=v1", "-uall"], cwd);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, files: parseGitStatus(result.output || "") };
  });

  ipcMain.handle("git_diff_stats", (_event, { cwd }: { cwd: string }) => {
    let additions = 0;
    let deletions = 0;

    for (const args of [["diff", "--numstat"], ["diff", "--cached", "--numstat"]]) {
      const result = execGit(args, cwd);
      if (result.ok && result.output) {
        for (const line of result.output.split("\n")) {
          const parts = line.split("\t");
          if (parts.length >= 2 && parts[0] !== "-") {
            additions += parseInt(parts[0]) || 0;
            deletions += parseInt(parts[1]) || 0;
          }
        }
      }
    }

    const statusResult = execGit(["status", "--porcelain=v1", "-uall"], cwd);
    const changedFiles = statusResult.ok && statusResult.output
      ? statusResult.output.split("\n").filter(Boolean).length
      : 0;

    return { ok: true, additions, deletions, changedFiles };
  });

  ipcMain.handle("git_branch_info", (_event, { cwd }: { cwd: string }) => {
    const branchResult = execGit(["branch", "--show-current"], cwd);
    if (!branchResult.ok) return { ok: false, error: branchResult.error };

    const current = branchResult.output || "HEAD";
    const detached = !branchResult.output;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    const upstreamResult = execGit(["rev-parse", "--abbrev-ref", "@{upstream}"], cwd);
    if (upstreamResult.ok) {
      upstream = upstreamResult.output || null;
      const countResult = execGit(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], cwd);
      if (countResult.ok) {
        const parts = (countResult.output || "").split("\t");
        ahead = parseInt(parts[0]) || 0;
        behind = parseInt(parts[1]) || 0;
      }
    }

    return { ok: true, current, upstream, ahead, behind, detached };
  });

  ipcMain.handle("git_branches", (_event, { cwd }: { cwd: string }) => {
    const result = execGit(["branch", "-a", "--format=%(refname:short)\t%(objectname:short)\t%(HEAD)"], cwd);
    if (!result.ok) return { ok: false, error: result.error };

    const branches = (result.output || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, shortHash, head] = line.split("\t");
        return { name, shortHash, isCurrent: head === "*", isRemote: name.startsWith("origin/") };
      });
    return { ok: true, branches };
  });

  ipcMain.handle("git_log", (_event, { cwd, count = 50, skip = 0 }: { cwd: string; count?: number; skip?: number }) => {
    const result = execGit(
      ["log", "--all", `--format=%H\t%h\t%an\t%ae\t%at\t%s\t%D\t%P`, `-n`, String(count), `--skip=${skip}`],
      cwd,
    );
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.output) return { ok: true, entries: [] };

    const entries = result.output.split("\n").filter(Boolean).map((line) => {
      const [hash, shortHash, author, authorEmail, timestamp, subject, refs, parents] = line.split("\t");
      return {
        hash, shortHash, author, authorEmail,
        timestamp: parseInt(timestamp),
        subject, refs: refs || "",
        parentHashes: parents ? parents.split(" ").filter(Boolean) : [],
      };
    });
    return { ok: true, entries };
  });

  ipcMain.handle("git_show_commit", (_event, { cwd, hash }: { cwd: string; hash: string }) => {
    const metaResult = execGit(["show", "--format=%H\t%h\t%an\t%ae\t%at\t%s\t%b", "--no-patch", hash], cwd);
    if (!metaResult.ok) return { ok: false, error: metaResult.error };

    const metaLine = (metaResult.output || "").split("\n")[0];
    const [h, shortHash, author, authorEmail, timestamp, subject, ...bodyParts] = metaLine.split("\t");

    const statResult = execGit(["diff-tree", "--no-commit-id", "-r", "--name-status", hash], cwd);
    const files = (statResult.ok && statResult.output)
      ? statResult.output.split("\n").filter(Boolean).map((line) => {
          const [status, ...pathParts] = line.split("\t");
          return { status, path: pathParts.join("\t") };
        })
      : [];

    const diffResult = execGit(["show", "--format=", "--patch", hash], cwd, 30000);
    const diff = diffResult.ok ? diffResult.output || "" : "";

    return {
      ok: true, hash: h, shortHash, author, authorEmail,
      timestamp: parseInt(timestamp),
      subject, body: bodyParts.join("\t").trim(),
      files, diff,
    };
  });

  ipcMain.handle("git_file_diff", (_event, { cwd, filePath, staged }: { cwd: string; filePath: string; staged?: boolean }) => {
    const args = ["diff"];
    if (staged) args.push("--cached");
    args.push("--", filePath);
    const result = execGit(args, cwd);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, diff: result.output };
  });

  ipcMain.handle("git_stage", (_event, { cwd, paths }: { cwd: string; paths: string[] }) => {
    const result = execGit(["add", "--", ...paths], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_unstage", (_event, { cwd, paths }: { cwd: string; paths: string[] }) => {
    const result = execGit(["reset", "HEAD", "--", ...paths], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_discard", (_event, { cwd, paths }: { cwd: string; paths: string[] }) => {
    const result = execGit(["checkout", "--", ...paths], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_commit", (_event, { cwd, message }: { cwd: string; message: string }) => {
    const result = execGit(["commit", "-m", message], cwd);
    if (!result.ok) return { ok: false, error: result.error };
    const hashMatch = (result.output || "").match(/\[[\w/]+ ([a-f0-9]+)\]/);
    return { ok: true, hash: hashMatch ? hashMatch[1] : undefined };
  });

  ipcMain.handle("git_push", (_event, { cwd, setUpstream }: { cwd: string; setUpstream?: boolean }) => {
    const args = ["push"];
    if (setUpstream) {
      const branchResult = execGit(["branch", "--show-current"], cwd);
      if (branchResult.ok && branchResult.output) {
        args.push("--set-upstream", "origin", branchResult.output);
      }
    }
    const result = execGit(args, cwd, 30000);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_pull", (_event, { cwd }: { cwd: string }) => {
    const result = execGit(["pull"], cwd, 30000);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_fetch", (_event, { cwd }: { cwd: string }) => {
    const result = execGit(["fetch", "--all"], cwd, 30000);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_switch_branch", (_event, { cwd, branch }: { cwd: string; branch: string }) => {
    const result = execGit(["switch", branch], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_create_branch", (_event, { cwd, branch, checkout }: { cwd: string; branch: string; checkout?: boolean }) => {
    const args = checkout ? ["switch", "-c", branch] : ["branch", branch];
    const result = execGit(args, cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle("git_delete_branch", (_event, { cwd, branch, force }: { cwd: string; branch: string; force?: boolean }) => {
    const result = execGit(["branch", force ? "-D" : "-d", branch], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  // ── Worktree ──

  ipcMain.handle("git_worktree_add", (_event, { cwd, branch }: { cwd: string; branch: string }) => {
    const basename = path.basename(cwd);
    const safeBranch = branch.replace(/\//g, "-");
    const worktreePath = path.resolve(cwd, "..", `${basename}-wt-${safeBranch}`);

    // Check if branch already exists (local or remote)
    const verify = execGit(["rev-parse", "--verify", branch], cwd);
    const args = verify.ok
      ? ["worktree", "add", worktreePath, branch]
      : ["worktree", "add", "-b", branch, worktreePath];

    const result = execGit(args, cwd);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, path: worktreePath };
  });

  ipcMain.handle("git_worktree_list", (_event, { cwd }: { cwd: string }) => {
    const result = execGit(["worktree", "list", "--porcelain"], cwd);
    if (!result.ok) return { ok: false, error: result.error };

    const worktrees: Array<{ path: string; branch: string; bare: boolean }> = [];
    let current: { path: string; branch: string; bare: boolean } | null = null;

    for (const line of (result.output || "").split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current) worktrees.push(current);
        current = { path: line.slice(9), branch: "", bare: false };
      } else if (line === "bare" && current) {
        current.bare = true;
      } else if (line.startsWith("branch ") && current) {
        current.branch = line.slice(7).replace("refs/heads/", "");
      }
    }
    if (current) worktrees.push(current);

    return { ok: true, worktrees };
  });

  ipcMain.handle("git_worktree_remove", (_event, { cwd, worktreePath }: { cwd: string; worktreePath: string }) => {
    const result = execGit(["worktree", "remove", worktreePath], cwd);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });

  ipcMain.handle(
    "git_clone",
    (
      _event,
      {
        parentDir,
        folderName,
        remoteUrl,
      }: { parentDir: string; folderName: string; remoteUrl: string },
    ) => {
      try {
        if (fs.existsSync(parentDir)) {
          if (!fs.statSync(parentDir).isDirectory()) {
            return { ok: false, error: `${parentDir} is not a directory` };
          }
        } else {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        const targetPath = path.join(parentDir, folderName);
        if (fs.existsSync(targetPath)) {
          return { ok: false, error: `Target already exists: ${targetPath}` };
        }

        // 10-minute timeout for large repos / slow connections
        const result = execGit(
          ["clone", remoteUrl, folderName],
          parentDir,
          10 * 60 * 1000,
        );
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, path: targetPath };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}
