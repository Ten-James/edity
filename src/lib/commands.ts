import { dispatch } from "@/stores/eventBus";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useRunStore } from "@/stores/runStore";
import {
  IconTerminal2,
  IconX,
  IconArrowRight,
  IconArrowLeft,
  IconWorldWww,
  IconGitBranch,
  IconBrandOpenai,
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
} from "@tabler/icons-react";

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
  const pane = state.panes.find((p) => p.id === state.focusedPaneId) ?? state.panes[0];
  return pane?.activeTabId ?? null;
}

function getFocusedPaneTabs() {
  const activeProject = useProjectStore.getState().activeProject;
  if (!activeProject) return [];
  const state = useLayoutStore.getState().projectPanes.get(activeProject.id);
  if (!state) return [];
  const pane = state.panes.find((p) => p.id === state.focusedPaneId) ?? state.panes[0];
  return pane?.tabs ?? [];
}

function getPaneCount(): number {
  const activeProject = useProjectStore.getState().activeProject;
  if (!activeProject) return 0;
  const state = useLayoutStore.getState().projectPanes.get(activeProject.id);
  return state?.panes.length ?? 0;
}

function cycleProject(direction: 1 | -1) {
  const { projects, activeProject } = useProjectStore.getState();
  if (projects.length < 2 || !activeProject) return;
  const idx = projects.findIndex((p) => p.id === activeProject.id);
  const next = projects[(idx + direction + projects.length) % projects.length];
  dispatch({ type: "project-switch", projectId: next.id });
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
      return (useRunStore.getState().runningProjects.get(proj.id)?.size ?? 0) === 0;
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
      return (useRunStore.getState().runningProjects.get(proj.id)?.size ?? 0) > 0;
    },
    execute: () => dispatch({ type: "run-stop" }),
  },
];
