import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { useProjectStore } from "./projectStore";
import type { GitBranchInfo, GitDiffStats } from "@/types/git";

function branchInfoEqual(
  a: GitBranchInfo | null,
  b: GitBranchInfo | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.current === b.current &&
    a.upstream === b.upstream &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.detached === b.detached
  );
}

function diffStatsEqual(
  a: GitDiffStats | null,
  b: GitDiffStats | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.additions === b.additions &&
    a.deletions === b.deletions &&
    a.changedFiles === b.changedFiles
  );
}

interface GitState {
  branchInfo: GitBranchInfo | null;
  diffStats: GitDiffStats | null;
  _pollIntervalId: ReturnType<typeof setInterval> | null;

  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useGitStore = create<GitState>((set, get) => ({
  branchInfo: null,
  diffStats: null,
  _pollIntervalId: null,

  refresh: async () => {
    const proj = useProjectStore.getState().activeProject;
    if (!proj) {
      const current = get();
      if (current.branchInfo !== null || current.diffStats !== null) {
        set({ branchInfo: null, diffStats: null });
      }
      return;
    }

    const [branchResult, diffResult] = await Promise.allSettled([
      invoke<{
        ok: boolean;
        current?: string;
        upstream?: string | null;
        ahead?: number;
        behind?: number;
        detached?: boolean;
      }>("git_branch_info", { cwd: proj.path }),
      invoke<{
        ok: boolean;
        additions?: number;
        deletions?: number;
        changedFiles?: number;
      }>("git_diff_stats", { cwd: proj.path }),
    ]);

    // Guard: project may have changed during await
    if (useProjectStore.getState().activeProject?.id !== proj.id) return;

    const branchInfo =
      branchResult.status === "fulfilled" && branchResult.value.ok
        ? {
            current: branchResult.value.current!,
            upstream: branchResult.value.upstream ?? null,
            ahead: branchResult.value.ahead ?? 0,
            behind: branchResult.value.behind ?? 0,
            detached: branchResult.value.detached ?? false,
          }
        : null;

    const diffStats =
      diffResult.status === "fulfilled" && diffResult.value.ok
        ? {
            additions: diffResult.value.additions ?? 0,
            deletions: diffResult.value.deletions ?? 0,
            changedFiles: diffResult.value.changedFiles ?? 0,
          }
        : null;

    const prev = get();
    const branchChanged = !branchInfoEqual(prev.branchInfo, branchInfo);
    const diffChanged = !diffStatsEqual(prev.diffStats, diffStats);
    if (branchChanged && diffChanged) {
      set({ branchInfo, diffStats });
    } else if (branchChanged) {
      set({ branchInfo });
    } else if (diffChanged) {
      set({ diffStats });
    }
  },

  startPolling: () => {
    get().stopPolling();
    get().refresh();
    const id = setInterval(() => get().refresh(), 10_000);
    set({ _pollIntervalId: id });
  },

  stopPolling: () => {
    const id = get()._pollIntervalId;
    if (id) clearInterval(id);
    set({ _pollIntervalId: null });
  },
}));

subscribe((event) => {
  switch (event.type) {
    case "project-switch":
    case "project-stack-add":
      // Restart polling for the newly focused project (the stack focus
      // is always reflected in projectStore.activeProject).
      useGitStore.getState().startPolling();
      break;
    case "git-refresh":
      useGitStore.getState().refresh();
      break;
  }
});
