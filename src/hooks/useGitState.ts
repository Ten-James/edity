import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type {
  GitFileStatus,
  GitBranch,
  GitLogEntry,
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
  isPushing: false,
  isPulling: false,
  isCommitting: false,
};

interface GitResult<T = unknown> {
  ok: boolean;
  error?: string;
  [key: string]: T | boolean | string | undefined;
}

export function useGitState(projectPath: string) {
  const [state, setState] = useState<GitState>(initialState);
  const cwdRef = useRef(projectPath);
  cwdRef.current = projectPath;

  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selectedFile: null, selectedDiff: null }));
  }, []);

  const refreshStatus = useCallback(async () => {
    const cwd = cwdRef.current;
    try {
      const statusResult = await invoke<GitResult & { files?: GitFileStatus[] }>(
        "git_status",
        { cwd },
      );

      // Guard against stale response if project changed
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

      setState((s) => ({
        ...s,
        isRepo: true,
        isLoading: false,
        error: null,
        staged,
        unstaged,
        untracked,
      }));
    } catch {
      if (cwd !== cwdRef.current) return;
      setState((s) => ({
        ...s,
        isRepo: false,
        isLoading: false,
        error: "Failed to get git status",
      }));
    }
  }, []);

  // Auto-refresh on mount and interval
  useEffect(() => {
    setState(initialState);
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [projectPath, refreshStatus]);

  const selectFile = useCallback(
    async (path: string, staged: boolean) => {
      const cwd = cwdRef.current;
      setState((s) => ({ ...s, selectedFile: { path, staged } }));
      try {
        const result = await invoke<GitResult & { diff?: string }>(
          "git_file_diff",
          { cwd, filePath: path, staged },
        );
        setState((s) => ({
          ...s,
          selectedDiff: result.ok ? (result.diff as string) ?? "" : null,
        }));
      } catch {
        setState((s) => ({ ...s, selectedDiff: null }));
      }
    },
    [],
  );

  const gitFileAction = useCallback(
    async (command: string, paths: string[]) => {
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
    },
    [refreshStatus, clearSelection],
  );

  const stage = useCallback(
    (paths: string[]) => gitFileAction("git_stage", paths),
    [gitFileAction],
  );

  const unstage = useCallback(
    (paths: string[]) => gitFileAction("git_unstage", paths),
    [gitFileAction],
  );

  const discard = useCallback(
    (paths: string[]) => gitFileAction("git_discard", paths),
    [gitFileAction],
  );

  const commit = useCallback(
    async (message: string) => {
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
    },
    [refreshStatus, clearSelection],
  );

  const push = useCallback(
    async (setUpstream?: boolean) => {
      setState((s) => ({ ...s, isPushing: true }));
      const result = await invoke<GitResult>("git_push", {
        cwd: cwdRef.current,
        setUpstream,
      });
      await refreshStatus();
      setState((s) => ({ ...s, isPushing: false }));
      return result;
    },
    [refreshStatus],
  );

  const pull = useCallback(async () => {
    setState((s) => ({ ...s, isPulling: true }));
    const result = await invoke<GitResult>("git_pull", {
      cwd: cwdRef.current,
    });
    await refreshStatus();
    setState((s) => ({ ...s, isPulling: false }));
    return result;
  }, [refreshStatus]);

  const fetch = useCallback(async () => {
    await invoke("git_fetch", { cwd: cwdRef.current });
    await refreshStatus();
  }, [refreshStatus]);

  const loadBranches = useCallback(async () => {
    const result = await invoke<GitResult & { branches?: GitBranch[] }>(
      "git_branches",
      { cwd: cwdRef.current },
    );
    if (result.ok) {
      setState((s) => ({ ...s, branches: result.branches ?? [] }));
    }
  }, []);

  const switchBranch = useCallback(
    async (branch: string) => {
      const result = await invoke<GitResult>("git_switch_branch", {
        cwd: cwdRef.current,
        branch,
      });
      if (result.ok) {
        await refreshStatus();
        await loadBranches();
      }
      return result;
    },
    [refreshStatus, loadBranches],
  );

  const createBranch = useCallback(
    async (branch: string, checkout: boolean) => {
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
    },
    [refreshStatus, loadBranches],
  );

  const deleteBranch = useCallback(
    async (branch: string, force?: boolean) => {
      const result = await invoke<GitResult>("git_delete_branch", {
        cwd: cwdRef.current,
        branch,
        force,
      });
      if (result.ok) {
        await loadBranches();
      }
      return result;
    },
    [loadBranches],
  );

  const loadLog = useCallback(
    async (count = 50, skip = 0) => {
      const result = await invoke<GitResult & { entries?: GitLogEntry[] }>(
        "git_log",
        { cwd: cwdRef.current, count, skip },
      );
      if (result.ok) {
        setState((s) => ({
          ...s,
          log: skip === 0 ? (result.entries ?? []) : [...s.log, ...(result.entries ?? [])],
        }));
      }
    },
    [],
  );

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
  };
}
