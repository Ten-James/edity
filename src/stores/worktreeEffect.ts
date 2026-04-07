import { invoke } from "@/lib/ipc";
import { dispatch, subscribe } from "./eventBus";
import { useProjectStore } from "./projectStore";
import { toast } from "sonner";

/**
 * Create a git worktree and open a terminal tab in it.
 * Shared between WorktreeDialog (UI) and MCP event handler.
 */
export async function createWorktreeAndOpenTerminal(
  branch: string,
  initialCommand?: string,
): Promise<void> {
  const project = useProjectStore.getState().activeProject;
  if (!project) {
    toast.error("No active project");
    return;
  }

  const result = await invoke<{ ok: true; path: string } | { ok: false; error: string }>(
    "git_worktree_add",
    { cwd: project.path, branch },
  );

  if (!result.ok) {
    toast.error(`Worktree failed: ${result.error}`);
    return;
  }

  dispatch({
    type: "tab-create-terminal",
    cwd: result.path,
    worktreeBranch: branch,
    initialCommand,
  });

  toast.success(`Worktree created: ${branch}`);
}

// Side-effect: handle "worktree-create" events from MCP
subscribe((event) => {
  if (event.type === "worktree-create") {
    createWorktreeAndOpenTerminal(event.branch, event.initialCommand);
  }
});
