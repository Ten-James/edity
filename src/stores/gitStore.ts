import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { useProjectStore } from "./projectStore";
import type { GitBranchInfo, GitDiffStats } from "@/types/git";

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
      set({ branchInfo: null, diffStats: null });
      return;
    }

    const [branchResult, diffResult] = await Promise.allSettled([
      invoke<{
        ok: boolean; current?: string; upstream?: string | null;
        ahead?: number; behind?: number; detached?: boolean;
      }>("git_branch_info", { cwd: proj.path }),
      invoke<{
        ok: boolean; additions?: number; deletions?: number; changedFiles?: number;
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

    set({ branchInfo, diffStats });
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
      // Restart polling for new project
      useGitStore.getState().startPolling();
      break;
    case "git-refresh":
      useGitStore.getState().refresh();
      break;
  }
});
