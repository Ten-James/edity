import { dispatch } from "@/stores/eventBus";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useRunStore } from "@/stores/runStore";
import { findLeafByPaneId, firstLeaf, countLeaves } from "@/lib/paneTree";
import {
  IconTerminal2,
  IconX,
  IconArrowRight,
  IconArrowLeft,
  IconWorldWww,
  IconGitBranch,
  IconBrandOpenai,
  IconDatabase,
  IconLayoutSidebarLeftExpand,
  IconLayoutColumns,
  IconLayoutRows,
  IconLayoutList,
  IconArrowsSplit2,
  IconFolderPlus,
  IconChevronRight,
  IconChevronLeft,
  IconPlayerPlay,
  IconPlayerStop,
  IconSun,
  IconSettings,
  IconSearch,
  IconGitMerge,
  IconBug,
  IconActivityHeartbeat,
  IconGitFork,
  IconCloudDownload,
  IconDeviceMobile,
  IconBrush,
} from "@tabler/icons-react";
import { invoke } from "@/lib/ipc";
import { toast } from "sonner";
import { getConsoleLog } from "@/lib/console-capture";

export interface Command {
  id: string;
  label: string;
  category: string;
  icon?: React.ComponentType<{ size?: number }>;
  defaultKeybinding?: string;
  when?: () => boolean;
  alwaysActive?: boolean;
  execute: () => void;
}

function getActiveTabId(): string | null {
  const activeProject = useProjectStore.getState().activeProject;
  if (!activeProject) return null;
  const state = useLayoutStore.getState().projectPanes.get(activeProject.id);
  if (!state) return null;
  const leaf =
    findLeafByPaneId(state.root, state.focusedPaneId) ?? firstLeaf(state.root);
  return leaf?.pane.activeTabId ?? null;
}

function getFocusedPaneTabs() {
  const activeProject = useProjectStore.getState().activeProject;
  if (!activeProject) return [];
  const state = useLayoutStore.getState().projectPanes.get(activeProject.id);
  if (!state) return [];
  const leaf =
    findLeafByPaneId(state.root, state.focusedPaneId) ?? firstLeaf(state.root);
  return leaf?.pane.tabs ?? [];
}

function getPaneCount(): number {
  const activeProject = useProjectStore.getState().activeProject;
  if (!activeProject) return 0;
  const state = useLayoutStore.getState().projectPanes.get(activeProject.id);
  return state ? countLeaves(state.root) : 0;
}

function cycleProject(direction: 1 | -1) {
  const { projects, activeProject } = useProjectStore.getState();
  if (projects.length < 2 || !activeProject) return;
  const idx = projects.findIndex((p) => p.id === activeProject.id);
  const next = projects[(idx + direction + projects.length) % projects.length];
  dispatch({ type: "project-switch", projectId: next.id });
}

/**
 * Wait until any open Radix overlay has finished closing and restored the
 * body's scroll lock / pointer-events / aria-hidden state. `react-remove-scroll`
 * adds `data-scroll-locked` to body when any Dialog/Popover is open and
 * removes it when the last one is fully unmounted (after its exit animation).
 * Polls at ~60fps up to `maxMs` then bails out so a genuinely stuck overlay
 * still gets captured rather than hanging the command.
 */
async function waitForBodyUnlocked(maxMs: number): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    if (!document.body.hasAttribute("data-scroll-locked")) return;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

export const COMMANDS: Command[] = [
  // General
  {
    id: "palette.open",
    label: "Open Command Palette",
    category: "General",
    icon: IconSearch,
    defaultKeybinding: "Mod+p",
    alwaysActive: true,
    execute: () => dispatch({ type: "ui-open-palette" }),
  },
  {
    id: "settings.open",
    label: "Open Settings",
    category: "General",
    icon: IconSettings,
    defaultKeybinding: "Mod+,",
    alwaysActive: true,
    execute: () => dispatch({ type: "ui-open-settings" }),
  },
  {
    id: "palette.fuzzy-finder",
    label: "Find in Project",
    category: "General",
    icon: IconSearch,
    defaultKeybinding: "Mod+Shift+p",
    alwaysActive: true,
    execute: () => dispatch({ type: "ui-open-fuzzy-finder" }),
  },

  // Tab
  {
    id: "tab.new-terminal",
    label: "New Terminal",
    category: "Tab",
    icon: IconTerminal2,
    defaultKeybinding: "Mod+t",
    execute: () => dispatch({ type: "tab-create-terminal" }),
  },
  {
    id: "tab.close",
    label: "Close Tab",
    category: "Tab",
    icon: IconX,
    defaultKeybinding: "Mod+w",
    when: () => getActiveTabId() !== null,
    execute: () => {
      const tabId = getActiveTabId();
      if (tabId) dispatch({ type: "tab-close", tabId });
    },
  },
  {
    id: "tab.next",
    label: "Next Tab",
    category: "Tab",
    icon: IconArrowRight,
    defaultKeybinding: "Ctrl+Tab",
    alwaysActive: true,
    when: () => getFocusedPaneTabs().length > 1,
    execute: () => dispatch({ type: "tab-next" }),
  },
  {
    id: "tab.prev",
    label: "Previous Tab",
    category: "Tab",
    icon: IconArrowLeft,
    defaultKeybinding: "Ctrl+Shift+Tab",
    alwaysActive: true,
    when: () => getFocusedPaneTabs().length > 1,
    execute: () => dispatch({ type: "tab-prev" }),
  },
  {
    id: "tab.new-browser",
    label: "New Browser Tab",
    category: "Tab",
    icon: IconWorldWww,
    execute: () => dispatch({ type: "tab-create-browser" }),
  },
  {
    id: "tab.open-git",
    label: "Open Git",
    category: "Tab",
    icon: IconGitBranch,
    execute: () => dispatch({ type: "tab-create-git" }),
  },
  {
    id: "tab.open-claude",
    label: "Open Claude",
    category: "Tab",
    icon: IconBrandOpenai,
    execute: () => dispatch({ type: "tab-create-claude" }),
  },
  {
    id: "tab.open-data",
    label: "Open Data Viewer",
    category: "Tab",
    icon: IconDatabase,
    execute: () => dispatch({ type: "tab-create-data" }),
  },
  {
    id: "tab.new-excalidraw",
    label: "New Excalidraw Drawing",
    category: "Tab",
    icon: IconBrush,
    when: () => !!useProjectStore.getState().activeProject,
    execute: async () => {
      const proj = useProjectStore.getState().activeProject;
      if (!proj) return;
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      const filePath = `${proj.path}/drawing-${stamp}.excalidraw`;
      const result = await invoke<{ ok: boolean; error?: string }>(
        "create_file",
        { filePath },
      );
      if (result.ok) {
        dispatch({ type: "tab-open-file", filePath });
      } else {
        toast.error(result.error ?? "Failed to create drawing");
      }
    },
  },

  // Pane
  {
    id: "pane.split-right",
    label: "Split Right",
    category: "Pane",
    icon: IconLayoutColumns,
    defaultKeybinding: "Mod+\\",
    execute: () => dispatch({ type: "layout-split", direction: "horizontal" }),
  },
  {
    id: "pane.split-down",
    label: "Split Down",
    category: "Pane",
    icon: IconLayoutRows,
    defaultKeybinding: "Mod+Shift+\\",
    execute: () => dispatch({ type: "layout-split", direction: "vertical" }),
  },
  {
    id: "pane.unsplit",
    label: "Unsplit Panes",
    category: "Pane",
    icon: IconLayoutList,
    when: () => getPaneCount() > 1,
    execute: () => dispatch({ type: "layout-unsplit" }),
  },
  {
    id: "pane.focus-other",
    label: "Focus Other Pane",
    category: "Pane",
    icon: IconArrowsSplit2,
    defaultKeybinding: "Mod+Shift+f",
    when: () => getPaneCount() > 1,
    execute: () => dispatch({ type: "layout-focus-other-pane" }),
  },

  // View
  {
    id: "sidebar.toggle-files",
    label: "Toggle File Explorer",
    category: "View",
    icon: IconLayoutSidebarLeftExpand,
    defaultKeybinding: "Mod+b",
    alwaysActive: true,
    execute: () => dispatch({ type: "layout-toggle-sidebar", panel: "files" }),
  },
  {
    id: "sidebar.toggle-git",
    label: "Toggle Git Sidebar",
    category: "View",
    icon: IconGitMerge,
    defaultKeybinding: "Mod+Shift+g",
    alwaysActive: true,
    execute: () => dispatch({ type: "layout-toggle-sidebar", panel: "git" }),
  },
  {
    id: "theme.toggle",
    label: "Toggle Light/Dark Mode",
    category: "View",
    icon: IconSun,
    execute: () => dispatch({ type: "settings-toggle-mode" }),
  },

  // Project
  {
    id: "project.next",
    label: "Next Project",
    category: "Project",
    icon: IconChevronRight,
    defaultKeybinding: "Mod+}",
    when: () => useProjectStore.getState().projects.length > 1,
    execute: () => cycleProject(1),
  },
  {
    id: "project.prev",
    label: "Previous Project",
    category: "Project",
    icon: IconChevronLeft,
    defaultKeybinding: "Mod+{",
    when: () => useProjectStore.getState().projects.length > 1,
    execute: () => cycleProject(-1),
  },
  {
    id: "project.add",
    label: "Add Project",
    category: "Project",
    icon: IconFolderPlus,
    execute: () => dispatch({ type: "project-add" }),
  },

  // Run
  {
    id: "run.start",
    label: "Run Project",
    category: "Run",
    icon: IconPlayerPlay,
    defaultKeybinding: "Mod+Shift+r",
    when: () => {
      const proj = useProjectStore.getState().activeProject;
      if (!proj) return false;
      return (
        (useRunStore.getState().runningProjects.get(proj.id)?.size ?? 0) === 0
      );
    },
    execute: () => dispatch({ type: "run-start" }),
  },
  {
    id: "run.stop",
    label: "Stop Project",
    category: "Run",
    icon: IconPlayerStop,
    when: () => {
      const proj = useProjectStore.getState().activeProject;
      if (!proj) return false;
      return (
        (useRunStore.getState().runningProjects.get(proj.id)?.size ?? 0) > 0
      );
    },
    execute: () => dispatch({ type: "run-stop" }),
  },

  {
    id: "tab.open-event-log",
    label: "Open Event Log",
    category: "Tab",
    icon: IconActivityHeartbeat,
    execute: () => dispatch({ type: "tab-create-event-log" }),
  },

  // Git
  {
    id: "git.create-worktree",
    label: "Create Git Worktree",
    category: "Git",
    icon: IconGitFork,
    when: () => !!useProjectStore.getState().activeProject,
    execute: () => dispatch({ type: "ui-open-worktree-dialog" }),
  },
  {
    id: "git.clone",
    label: "Clone Repository",
    category: "Git",
    icon: IconCloudDownload,
    alwaysActive: true,
    execute: () => dispatch({ type: "ui-open-clone-dialog" }),
  },

  // Remote Access
  {
    id: "tab.open-remote-access",
    label: "Start Remote Access",
    category: "Tab",
    icon: IconDeviceMobile,
    execute: () => dispatch({ type: "tab-create-remote-access" }),
  },

  // Debug
  {
    id: "debug.create-bug-report",
    label: "Create Bug Report",
    category: "Debug",
    icon: IconBug,
    alwaysActive: true,
    execute: async () => {
      // Wait for any closing Radix overlay (command palette, popover, etc.)
      // to finish its exit animation AND its cleanup effects before we
      // snapshot the DOM. Radix Dialog has a 100ms close animation driven by
      // `tailwindcss-animate`, and `react-remove-scroll` only restores
      // `pointer-events`, `aria-hidden`, and the focus guards *after* that
      // animation unmounts the content. If we capture before that happens,
      // the report ends up showing a stuck Dialog — nothing to do with the
      // real bug. Poll `data-scroll-locked` as the authoritative signal:
      // react-remove-scroll adds/removes it in lock-step with its side
      // effects. Bail out after 500 ms so a genuinely stuck Dialog is still
      // captured (it's then a real bug, not an artifact).
      await waitForBodyUnlocked(500);
      const dom = document.documentElement.outerHTML;
      const consoleLog = getConsoleLog();
      const result = await invoke<
        { ok: true; filePath: string } | { ok: false; error: string }
      >("create_bug_report", { dom, consoleLog });
      if (result.ok) {
        toast.success("Bug report saved");
      } else {
        toast.error(`Failed to create bug report: ${result.error}`);
      }
    },
  },
];
