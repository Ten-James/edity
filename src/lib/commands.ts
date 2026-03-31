import type { AppContextValue } from "@/contexts/AppContext";
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

export interface CommandContext extends Pick<AppContextValue,
  | "projects" | "activeProject" | "setActiveProject" | "addProject"
  | "tabs" | "activeTabId" | "createTab" | "closeTab" | "setActiveTab"
  | "openFileTab" | "createBrowserTab" | "createGitTab" | "createClaudeTab"
  | "splitPane" | "unsplit" | "panes" | "focusedPaneId" | "setFocusedPane"
  | "toggleSidebarPanel" | "sidebarPanel"
  | "runProject" | "stopProject" | "isProjectRunning"
> {
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleTheme: () => void;
  openSettings: () => void;
}

function cycleItem<T>(items: T[], currentId: string | null, getId: (t: T) => string, direction: 1 | -1): T | null {
  if (!currentId || items.length < 2) return null;
  const idx = items.findIndex((t) => getId(t) === currentId);
  return items[(idx + direction + items.length) % items.length];
}

export interface Command {
  id: string;
  label: string;
  category: string;
  icon?: React.ComponentType<{ size?: number }>;
  defaultKeybinding?: string;
  when?: (ctx: CommandContext) => boolean;
  alwaysActive?: boolean;
  execute: (ctx: CommandContext) => void;
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
    execute: (ctx) => ctx.openCommandPalette(),
  },
  {
    id: "settings.open",
    label: "Open Settings",
    category: "General",
    icon: IconSettings,
    defaultKeybinding: "Mod+,",
    alwaysActive: true,
    execute: (ctx) => ctx.openSettings(),
  },

  // Tab
  {
    id: "tab.new-terminal",
    label: "New Terminal",
    category: "Tab",
    icon: IconTerminal2,
    defaultKeybinding: "Mod+t",
    execute: (ctx) => ctx.createTab(),
  },
  {
    id: "tab.close",
    label: "Close Tab",
    category: "Tab",
    icon: IconX,
    defaultKeybinding: "Mod+w",
    when: (ctx) => ctx.activeTabId !== null,
    execute: (ctx) => {
      if (ctx.activeTabId) ctx.closeTab(ctx.activeTabId);
    },
  },
  {
    id: "tab.next",
    label: "Next Tab",
    category: "Tab",
    icon: IconArrowRight,
    defaultKeybinding: "Ctrl+Tab",
    alwaysActive: true,
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const next = cycleItem(ctx.tabs, ctx.activeTabId, (t) => t.id, 1);
      if (next) ctx.setActiveTab(next.id);
    },
  },
  {
    id: "tab.prev",
    label: "Previous Tab",
    category: "Tab",
    icon: IconArrowLeft,
    defaultKeybinding: "Ctrl+Shift+Tab",
    alwaysActive: true,
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const prev = cycleItem(ctx.tabs, ctx.activeTabId, (t) => t.id, -1);
      if (prev) ctx.setActiveTab(prev.id);
    },
  },
  {
    id: "tab.new-browser",
    label: "New Browser Tab",
    category: "Tab",
    icon: IconWorldWww,
    execute: (ctx) => ctx.createBrowserTab(),
  },
  {
    id: "tab.open-git",
    label: "Open Git",
    category: "Tab",
    icon: IconGitBranch,
    execute: (ctx) => ctx.createGitTab(),
  },
  {
    id: "tab.open-claude",
    label: "Open Claude",
    category: "Tab",
    icon: IconBrandOpenai,
    execute: (ctx) => ctx.createClaudeTab(),
  },

  // Pane
  {
    id: "pane.split-right",
    label: "Split Right",
    category: "Pane",
    icon: IconLayoutColumns,
    defaultKeybinding: "Mod+\\",
    execute: (ctx) => ctx.splitPane("horizontal"),
  },
  {
    id: "pane.split-down",
    label: "Split Down",
    category: "Pane",
    icon: IconLayoutRows,
    defaultKeybinding: "Mod+Shift+\\",
    execute: (ctx) => ctx.splitPane("vertical"),
  },
  {
    id: "pane.unsplit",
    label: "Unsplit Panes",
    category: "Pane",
    icon: IconLayoutList,
    when: (ctx) => ctx.panes.length > 1,
    execute: (ctx) => ctx.unsplit(),
  },
  {
    id: "pane.focus-other",
    label: "Focus Other Pane",
    category: "Pane",
    icon: IconArrowsSplit2,
    defaultKeybinding: "Mod+Shift+f",
    when: (ctx) => ctx.panes.length > 1,
    execute: (ctx) => {
      const other = ctx.panes.find((p) => p.id !== ctx.focusedPaneId);
      if (other) ctx.setFocusedPane(other.id);
    },
  },

  // View
  {
    id: "sidebar.toggle-files",
    label: "Toggle File Explorer",
    category: "View",
    icon: IconLayoutSidebarLeftExpand,
    defaultKeybinding: "Mod+b",
    alwaysActive: true,
    execute: (ctx) => ctx.toggleSidebarPanel("files"),
  },
  {
    id: "sidebar.toggle-git",
    label: "Toggle Git Sidebar",
    category: "View",
    icon: IconGitMerge,
    defaultKeybinding: "Mod+Shift+g",
    alwaysActive: true,
    execute: (ctx) => ctx.toggleSidebarPanel("git"),
  },
  {
    id: "theme.toggle",
    label: "Toggle Light/Dark Mode",
    category: "View",
    icon: IconSun,
    execute: (ctx) => ctx.toggleTheme(),
  },

  // Project
  {
    id: "project.next",
    label: "Next Project",
    category: "Project",
    icon: IconChevronRight,
    defaultKeybinding: "Mod+}",
    when: (ctx) => ctx.projects.length > 1,
    execute: (ctx) => {
      const next = cycleItem(ctx.projects, ctx.activeProject?.id ?? null, (p) => p.id, 1);
      if (next) ctx.setActiveProject(next);
    },
  },
  {
    id: "project.prev",
    label: "Previous Project",
    category: "Project",
    icon: IconChevronLeft,
    defaultKeybinding: "Mod+{",
    when: (ctx) => ctx.projects.length > 1,
    execute: (ctx) => {
      const prev = cycleItem(ctx.projects, ctx.activeProject?.id ?? null, (p) => p.id, -1);
      if (prev) ctx.setActiveProject(prev);
    },
  },
  {
    id: "project.add",
    label: "Add Project",
    category: "Project",
    icon: IconFolderPlus,
    execute: (ctx) => ctx.addProject(),
  },

  // Run
  {
    id: "run.start",
    label: "Run Project",
    category: "Run",
    icon: IconPlayerPlay,
    defaultKeybinding: "Mod+Shift+r",
    when: (ctx) => !ctx.isProjectRunning,
    execute: (ctx) => ctx.runProject(),
  },
  {
    id: "run.stop",
    label: "Stop Project",
    category: "Run",
    icon: IconPlayerStop,
    when: (ctx) => ctx.isProjectRunning,
    execute: (ctx) => ctx.stopProject(),
  },
];
