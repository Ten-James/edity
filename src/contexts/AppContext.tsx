import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { GitBranchInfo, GitDiffStats } from "@/types/git";
import type {
  Tab,
  AllTab,
  Pane,
  SplitDirection,
  ProjectPaneState,
  TerminalTab,
  FileTab,
  BrowserTab,
  GitTab,
  ClaudeTab,
} from "@/types/tab";

export type { Tab, AllTab, Pane, SplitDirection, ProjectPaneState, TerminalTab, FileTab, BrowserTab, GitTab, ClaudeTab };

import type { Project, EdityConfig, RunCommand } from "@shared/types/project";
import { dispatch } from "@/stores/eventBus";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore, useAllTabs } from "@/stores/layoutStore";
import { useGitStore } from "@/stores/gitStore";
import { useRunStore } from "@/stores/runStore";
import { useClaudeStore } from "@/stores/claudeStore";
export type { Project, EdityConfig, RunCommand };

export interface AppContextValue {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (p: Project) => void;
  addProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  reorderProjects: (fromIndex: number, toIndex: number) => void;

  tabs: Tab[];
  activeTabId: string | null;
  allTabs: AllTab[];
  createTab: (initialCommand?: string) => string;
  closeTab: (id: string) => void;
  closeTabsByFilePath: (filePath: string) => void;
  setActiveTab: (id: string) => void;

  updateTabTitle: (tabId: string, title: string) => void;

  openFileTab: (filePath: string) => void;
  pinTab: (tabId: string) => void;
  createBrowserTab: (initialUrl?: string) => string;
  updateBrowserUrl: (tabId: string, url: string) => void;
  createGitTab: () => void;
  createClaudeTab: () => void;

  projectPanes: Map<string, ProjectPaneState>;
  panes: Pane[];
  focusedPaneId: string | null;
  splitDirection: SplitDirection;
  splitPane: (direction: SplitDirection, tabId?: string) => void;
  moveTabToPane: (tabId: string, targetPaneId: string) => void;
  setFocusedPane: (paneId: string) => void;
  unsplit: () => void;

  sidebarPanel: "files" | "git" | null;
  toggleSidebarPanel: (panel: "files" | "git") => void;

  edityConfig: EdityConfig | null;
  projectConfigs: Map<string, EdityConfig | null>;
  saveEdityConfig: (config: EdityConfig, projectPath: string) => Promise<void>;
  runProject: (command?: RunCommand) => void;
  stopProject: (commandId?: string) => void;
  isProjectRunning: boolean;
  runningCommandIds: Set<string>;

  gitBranchInfo: GitBranchInfo | null;
  gitDiffStats: GitDiffStats | null;
  refreshGitBranchInfo: () => Promise<void>;

  dirtyTabs: Set<string>;
  setTabDirty: (tabId: string, dirty: boolean) => void;

  projectClaudeStatus: Map<string, "working" | "idle" | "notification" | "active" | null>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Read from stores
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const edityConfigs = useProjectStore((s) => s.edityConfigs);

  const projectPanes = useLayoutStore((s) => s.projectPanes);
  const sidebarPanel = useLayoutStore((s) => s.sidebarPanel);
  const dirtyTabs = useLayoutStore((s) => s.dirtyTabs);
  const allTabs = useAllTabs();

  const gitBranchInfo = useGitStore((s) => s.branchInfo);
  const gitDiffStats = useGitStore((s) => s.diffStats);

  const runningProjects = useRunStore((s) => s.runningProjects);
  const projectClaudeStatus = useClaudeStore((s) => s.projectStatuses);

  // Start pollers
  useEffect(() => {
    useGitStore.getState().startPolling();
    useClaudeStore.getState().startPolling();
    return () => {
      useGitStore.getState().stopPolling();
      useClaudeStore.getState().stopPolling();
    };
  }, []);

  // Derived layout state
  const currentState = activeProject ? projectPanes.get(activeProject.id) : undefined;
  const panes = currentState?.panes ?? [];
  const focusedPaneId = currentState?.focusedPaneId ?? null;
  const splitDirection = currentState?.splitDirection ?? "horizontal";
  const focusedPane = panes.find((p) => p.id === focusedPaneId) ?? panes[0];
  const tabs = focusedPane?.tabs ?? [];
  const activeTabId = focusedPane?.activeTabId ?? null;

  const edityConfig = activeProject ? edityConfigs.get(activeProject.id) ?? null : null;
  const runningCommandIds = activeProject
    ? runningProjects.get(activeProject.id) ?? new Set<string>()
    : new Set<string>();
  const isProjectRunning = runningCommandIds.size > 0;

  // Dispatch wrappers — thin facades over the event bus
  const value: AppContextValue = {
    projects,
    activeProject,
    setActiveProject: (p) => dispatch({ type: "project-switch", projectId: p.id }),
    addProject: async () => { dispatch({ type: "project-add" }); },
    removeProject: async (id) => { dispatch({ type: "project-remove", projectId: id }); },
    reorderProjects: (fromIndex, toIndex) => { dispatch({ type: "project-reorder", fromIndex, toIndex }); },

    tabs,
    activeTabId,
    allTabs,
    createTab: (initialCommand?) => { dispatch({ type: "tab-create-terminal", initialCommand }); return ""; },
    closeTab: (id) => { dispatch({ type: "tab-close", tabId: id }); },
    closeTabsByFilePath: (filePath) => { dispatch({ type: "tab-close-by-filepath", filePath }); },
    setActiveTab: (id) => { dispatch({ type: "tab-set-active", tabId: id }); },

    updateTabTitle: (tabId, title) => { dispatch({ type: "tab-update-title", tabId, title }); },
    openFileTab: (filePath) => { dispatch({ type: "tab-open-file", filePath }); },
    pinTab: (tabId) => { dispatch({ type: "tab-pin", tabId }); },
    createBrowserTab: (initialUrl?) => { dispatch({ type: "tab-create-browser", initialUrl }); return ""; },
    updateBrowserUrl: (tabId, url) => { dispatch({ type: "tab-update-browser-url", tabId, url }); },
    createGitTab: () => { dispatch({ type: "tab-create-git" }); },
    createClaudeTab: () => { dispatch({ type: "tab-create-claude" }); },

    projectPanes,
    panes,
    focusedPaneId,
    splitDirection,
    splitPane: (direction, tabId?) => { dispatch({ type: "layout-split", direction, tabId }); },
    moveTabToPane: (tabId, targetPaneId) => { dispatch({ type: "layout-move-tab", tabId, targetPaneId }); },
    setFocusedPane: (paneId) => { dispatch({ type: "layout-focus-pane", paneId }); },
    unsplit: () => { dispatch({ type: "layout-unsplit" }); },

    sidebarPanel,
    toggleSidebarPanel: (panel) => { dispatch({ type: "layout-toggle-sidebar", panel }); },

    edityConfig,
    projectConfigs: edityConfigs,
    saveEdityConfig: async (config, projectPath) => { useProjectStore.getState()._saveConfig(config, projectPath); },
    runProject: (command?) => { dispatch({ type: "run-start", command }); },
    stopProject: (commandId?) => { dispatch({ type: "run-stop", commandId }); },
    isProjectRunning,
    runningCommandIds,

    gitBranchInfo,
    gitDiffStats,
    refreshGitBranchInfo: async () => { dispatch({ type: "git-refresh" }); },

    dirtyTabs,
    setTabDirty: (tabId, dirty) => { dispatch({ type: "tab-set-dirty", tabId, dirty }); },

    projectClaudeStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
