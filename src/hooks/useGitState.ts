import { useEffect, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type {
  GitFileStatus,
  GitBranch,
  GitLogEntry,
  GitCommitDetail,
} from "@/types/git";

interface GitState {
  isRepo: boolean;
  isLoading: boolean;
  error: string | null;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  branches: GitBranch[];
  log: GitLogEntry[];
  selectedFile: { path: string; staged: boolean } | null;
  selectedDiff: string | null;
  selectedCommit: GitCommitDetail | null;
  isPushing: boolean;
  isPulling: boolean;
  isCommitting: boolean;
}

const initialState: GitState = {
  isRepo: true,
  isLoading: true,
  error: null,
  staged: [],
  unstaged: [],
  untracked: [],
  branches: [],
  log: [],
  selectedFile: null,
  selectedDiff: null,
  selectedCommit: null,
  isPushing: false,
  isPulling: false,
  isCommitting: false,
};

interface GitResult<T = unknown> {
  ok: boolean;
  error?: string;
  [key: string]: T | boolean | string | undefined;
}

function fileStatusEqual(a: GitFileStatus, b: GitFileStatus): boolean {
  return (
    a.path === b.path &&
    a.indexStatus === b.indexStatus &&
    a.workTreeStatus === b.workTreeStatus &&
    a.originalPath === b.originalPath
  );
}

function fileListsEqual(a: GitFileStatus[], b: GitFileStatus[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!fileStatusEqual(a[i], b[i])) return false;
  }
  return true;
}

export function useGitState(projectPath: string) {
  const [state, setState] = useState<GitState>(initialState);
  const cwdRef = useRef(projectPath);
  useEffect(() => {
    cwdRef.current = projectPath;
  }, [projectPath]);

  const clearSelection = () => {
    setState((s) => ({ ...s, selectedFile: null, selectedDiff: null }));
  };

  const refreshStatus = async () => {
    const cwd = cwdRef.current;
    let statusResult: GitResult & { files?: GitFileStatus[] };
    try {
      statusResult = await invoke<GitResult & { files?: GitFileStatus[] }>(
        "git_status",
        { cwd },
      );
    } catch {
      if (cwd !== cwdRef.current) return;
      setState((s) => ({
        ...s,
        isRepo: false,
        isLoading: false,
        error: "Failed to get git status",
      }));
      return;
    }

    if (cwd !== cwdRef.current) return;

    if (!statusResult.ok) {
      setState((s) => ({ ...s, isRepo: false, isLoading: false }));
      return;
    }

    const files = statusResult.files ?? [];
    const staged = files.filter(
      (f) => f.indexStatus !== " " && f.indexStatus !== "?",
    );
    const unstaged = files.filter(
      (f) =>
        f.workTreeStatus !== " " &&
        f.workTreeStatus !== "?" &&
        f.indexStatus !== "?",
    );
    const untracked = files.filter((f) => f.indexStatus === "?");

    setState((s) => {
      if (
        s.isRepo &&
        !s.isLoading &&
        s.error === null &&
        fileListsEqual(s.staged, staged) &&
        fileListsEqual(s.unstaged, unstaged) &&
        fileListsEqual(s.untracked, untracked)
      ) {
        return s;
      }
      return {
        ...s,
        isRepo: true,
        isLoading: false,
        error: null,
        staged,
        unstaged,
        untracked,
      };
    });
  };

  useEffect(() => {
    setState(initialState);
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [projectPath]);

  const selectFile = async (path: string, staged: boolean) => {
    const cwd = cwdRef.current;
    setState((s) => ({ ...s, selectedFile: { path, staged }, selectedDiff: null }));

    const isUntracked = state.untracked.some((f) => f.path === path);
    const isNewStaged =
      staged &&
      state.staged.some((f) => f.path === path && f.indexStatus === "A");

    if (isUntracked || isNewStaged) {
      try {
        const fullPath = `${cwd}/${path}`;
        const fileResult = await invoke<{ type: string; content?: string }>(
          "read_file_content",
          { path: fullPath },
        );
        setState((s) => {
          if (s.selectedFile?.path !== path || s.selectedFile?.staged !== staged) return s;
          if (fileResult.type === "Text" && fileResult.content) {
            const lines = fileResult.content.split("\n");
            const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n`;
            const body = lines.map((l) => `+${l}`).join("\n");
            return { ...s, selectedDiff: header + body };
          }
          return { ...s, selectedDiff: null };
        });
      } catch {
        setState((s) => {
          if (s.selectedFile?.path !== path || s.selectedFile?.staged !== staged) return s;
          return { ...s, selectedDiff: null };
        });
      }
      return;
    }

    try {
      const result = await invoke<GitResult & { diff?: string }>(
        "git_file_diff",
        { cwd, filePath: path, staged },
      );
      setState((s) => {
        if (s.selectedFile?.path !== path || s.selectedFile?.staged !== staged) return s;
        return { ...s, selectedDiff: result.ok ? ((result.diff as string) ?? "") : null };
      });
    } catch {
      setState((s) => {
        if (s.selectedFile?.path !== path || s.selectedFile?.staged !== staged) return s;
        return { ...s, selectedDiff: null };
      });
    }
  };

  const gitFileAction = async (command: string, paths: string[]) => {
    try {
      const result = await invoke<GitResult>(command, {
        cwd: cwdRef.current,
        paths,
      });
      await refreshStatus();
      clearSelection();
      return result;
    } catch {
      await refreshStatus();
      clearSelection();
      return { ok: false, error: "Operation failed" };
    }
  };

  const stage = (paths: string[]) => gitFileAction("git_stage", paths);
  const unstage = (paths: string[]) => gitFileAction("git_unstage", paths);
  const discard = (paths: string[]) => gitFileAction("git_discard", paths);

  const commit = async (message: string) => {
    setState((s) => ({ ...s, isCommitting: true }));
    try {
      const result = await invoke<GitResult & { hash?: string }>(
        "git_commit",
        { cwd: cwdRef.current, message },
      );
      await refreshStatus();
      setState((s) => ({ ...s, isCommitting: false }));
      clearSelection();
      return result;
    } catch {
      setState((s) => ({ ...s, isCommitting: false }));
      return { ok: false, error: "Commit failed" };
    }
  };

  const push = async (setUpstream?: boolean) => {
    setState((s) => ({ ...s, isPushing: true }));
    const result = await invoke<GitResult>("git_push", {
      cwd: cwdRef.current,
      setUpstream,
    });
    await refreshStatus();
    setState((s) => ({ ...s, isPushing: false }));
    return result;
  };

  const pull = async () => {
    setState((s) => ({ ...s, isPulling: true }));
    const result = await invoke<GitResult>("git_pull", {
      cwd: cwdRef.current,
    });
    await refreshStatus();
    setState((s) => ({ ...s, isPulling: false }));
    return result;
  };

  const fetch = async () => {
    await invoke("git_fetch", { cwd: cwdRef.current });
    await refreshStatus();
  };

  const loadBranches = async () => {
    const result = await invoke<GitResult & { branches?: GitBranch[] }>(
      "git_branches",
      { cwd: cwdRef.current },
    );
    if (result.ok) {
      setState((s) => ({ ...s, branches: result.branches ?? [] }));
    }
  };

  const switchBranch = async (branch: string) => {
    const result = await invoke<GitResult>("git_switch_branch", {
      cwd: cwdRef.current,
      branch,
    });
    if (result.ok) {
      await refreshStatus();
      await loadBranches();
    }
    return result;
  };

  const createBranch = async (branch: string, checkout: boolean) => {
    const result = await invoke<GitResult>("git_create_branch", {
      cwd: cwdRef.current,
      branch,
      checkout,
    });
    if (result.ok) {
      await refreshStatus();
      await loadBranches();
    }
    return result;
  };

  const deleteBranch = async (branch: string, force?: boolean) => {
    const result = await invoke<GitResult>("git_delete_branch", {
      cwd: cwdRef.current,
      branch,
      force,
    });
    if (result.ok) {
      await loadBranches();
    }
    return result;
  };

  const loadLog = async (count = 50, skip = 0) => {
    const result = await invoke<GitResult & { entries?: GitLogEntry[] }>(
      "git_log",
      { cwd: cwdRef.current, count, skip },
    );
    if (result.ok) {
      setState((s) => ({
        ...s,
        log:
          skip === 0
            ? (result.entries ?? [])
            : [...s.log, ...(result.entries ?? [])],
      }));
    }
  };

  const selectCommit = async (hash: string) => {
    try {
      const result = await invoke<GitResult & GitCommitDetail>(
        "git_show_commit",
        { cwd: cwdRef.current, hash },
      );
      if (result.ok) {
        setState((s) => ({
          ...s,
          selectedCommit: {
            hash: result.hash as string,
            shortHash: result.shortHash as string,
            author: result.author as string,
            authorEmail: result.authorEmail as string,
            timestamp: result.timestamp as number,
            subject: result.subject as string,
            body: (result.body as string) ?? "",
            files: (result.files as GitCommitDetail["files"]) ?? [],
            diff: (result.diff as string) ?? "",
          },
        }));
      }
    } catch {
      setState((s) => ({ ...s, selectedCommit: null }));
    }
  };

  const clearSelectedCommit = () => {
    setState((s) => ({ ...s, selectedCommit: null }));
  };

  return {
    ...state,
    refreshStatus,
    selectFile,
    stage,
    unstage,
    discard,
    commit,
    push,
    pull,
    fetch,
    loadBranches,
    switchBranch,
    createBranch,
    deleteBranch,
    loadLog,
    selectCommit,
    clearSelectedCommit,
  };
}
