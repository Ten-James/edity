import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke, listen } from "@/lib/ipc";
import { toast } from "sonner";
import type { GitBranchInfo, GitDiffStats } from "@/types/git";
import { useTabManager } from "@/hooks/useTabManager";
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
} from "@/types/tab";

export type { Tab, AllTab, Pane, SplitDirection, ProjectPaneState, TerminalTab, FileTab, BrowserTab, GitTab };

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface EdityConfig {
  acronym?: string;
  color?: string;
  runCommand?: string;
  runMode?: "terminal" | "background";
}

interface AppContextValue {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (p: Project) => void;
  addProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;

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

  projectPanes: Map<string, ProjectPaneState>;
  panes: Pane[];
  focusedPaneId: string | null;
  splitDirection: SplitDirection;
  splitPane: (direction: SplitDirection, tabId?: string) => void;
  moveTabToPane: (tabId: string, targetPaneId: string) => void;
  setFocusedPane: (paneId: string) => void;
  unsplit: () => void;

  fileTreeOpen: boolean;
  toggleFileTree: () => void;

  edityConfig: EdityConfig | null;
  projectConfigs: Map<string, EdityConfig | null>;
  saveEdityConfig: (config: EdityConfig, projectPath: string) => Promise<void>;
  runProject: () => void;
  stopProject: () => void;
  isProjectRunning: boolean;

  gitBranchInfo: GitBranchInfo | null;
  gitDiffStats: GitDiffStats | null;
  refreshGitBranchInfo: () => Promise<void>;

  dirtyTabs: Set<string>;
  setTabDirty: (tabId: string, dirty: boolean) => void;

  projectClaudeStatus: Map<string, "working" | "idle" | "notification" | "active" | null>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [edityConfigs, setEdityConfigs] = useState<
    Map<string, EdityConfig | null>
  >(new Map());
  const [runningProjects, setRunningProjects] = useState<Set<string>>(
    new Set(),
  );

  const tabManager = useTabManager(activeProject, projects);

  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;

  const loadEdityConfig = useCallback(async (project: Project) => {
    try {
      const config = await invoke<EdityConfig | null>("read_edity_config", {
        projectPath: project.path,
      });
      setEdityConfigs((prev) => {
        const next = new Map(prev);
        next.set(project.id, config);
        return next;
      });
    } catch {
      setEdityConfigs((prev) => {
        const next = new Map(prev);
        next.set(project.id, null);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    invoke<Project[]>("get_projects")
      .then((p) => {
        setProjects(p);
        if (p.length > 0) {
          setActiveProjectState(p[0]);
          tabManager.ensureProjectPanes(p[0].id);
        }
        p.forEach((project) => loadEdityConfig(project));
      })
      .catch(() => {});
  }, [loadEdityConfig, tabManager.ensureProjectPanes]);

  const setActiveProject = useCallback(
    (p: Project) => {
      setActiveProjectState(p);
      tabManager.ensureProjectPanes(p.id);
    },
    [tabManager.ensureProjectPanes],
  );

  const addProject = useCallback(async () => {
    const result = await invoke<{ canceled: boolean; filePaths: string[] }>(
      "show-open-dialog",
      { properties: ["openDirectory"] },
    );
    if (result.canceled || result.filePaths.length === 0) return;

    const selected = result.filePaths[0];
    const folderName = selected.split("/").filter(Boolean).pop() ?? "Project";
    const project = await invoke<Project>("add_project", {
      name: folderName,
      path: selected,
    });
    setProjects((prev) => [...prev, project]);
    setActiveProjectState(project);
    tabManager.ensureProjectPanes(project.id);
    loadEdityConfig(project);
  }, [loadEdityConfig, tabManager.ensureProjectPanes]);

  const removeProject = useCallback(
    async (id: string) => {
      await invoke("remove_project", { id });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      tabManager.removeProjectPanes(id);
      setActiveProjectState((current) =>
        current?.id === id ? null : current,
      );
    },
    [tabManager.removeProjectPanes],
  );

  const saveEdityConfig = useCallback(
    async (config: EdityConfig, projectPath: string) => {
      try {
        await invoke("write_edity_config", { projectPath, config });
        const project = projects.find((p) => p.path === projectPath);
        if (project) {
          setEdityConfigs((prev) => {
            const next = new Map(prev);
            next.set(project.id, config);
            return next;
          });
        }
        toast.success("Configuration saved");
      } catch {
        toast.error("Failed to save configuration");
      }
    },
    [projects],
  );

  const exitListenersRef = useRef<Map<string, () => void>>(new Map());

  const cleanupExitListener = useCallback((projectId: string) => {
    const cleanup = exitListenersRef.current.get(projectId);
    if (cleanup) {
      cleanup();
      exitListenersRef.current.delete(projectId);
    }
  }, []);

  const runProject = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    const config = edityConfigs.get(proj.id);
    if (!config?.runCommand) return;

    if (config.runMode === "background") {
      cleanupExitListener(proj.id);
      invoke("run_project_command", {
        projectId: proj.id,
        command: config.runCommand,
        cwd: proj.path,
      }).then(() => {
        setRunningProjects((prev) => new Set(prev).add(proj.id));
        toast.success("Project started");
        listen(`project-run-exit-${proj.id}`, () => {
          setRunningProjects((prev) => {
            const next = new Set(prev);
            next.delete(proj.id);
            return next;
          });
          cleanupExitListener(proj.id);
        }).then((fn) => {
          exitListenersRef.current.set(proj.id, fn);
        });
      });
    } else {
      tabManager.createTab(config.runCommand);
    }
  }, [edityConfigs, cleanupExitListener, tabManager.createTab]);

  const stopProject = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    cleanupExitListener(proj.id);
    invoke("kill_project_command", { projectId: proj.id });
    setRunningProjects((prev) => {
      const next = new Set(prev);
      next.delete(proj.id);
      return next;
    });
    toast.success("Project stopped");
  }, [cleanupExitListener]);

  const edityConfig = activeProject
    ? edityConfigs.get(activeProject.id) ?? null
    : null;
  const isProjectRunning = activeProject
    ? runningProjects.has(activeProject.id)
    : false;

  const toggleFileTree = useCallback(() => setFileTreeOpen((v) => !v), []);

  // Git branch info polling
  const [gitBranchInfo, setGitBranchInfo] = useState<GitBranchInfo | null>(null);

  const refreshGitBranchInfo = useCallback(async () => {
    const proj = activeProjectRef.current;
    if (!proj) {
      setGitBranchInfo(null);
      return;
    }
    try {
      const result = await invoke<{
        ok: boolean;
        current?: string;
        upstream?: string | null;
        ahead?: number;
        behind?: number;
        detached?: boolean;
      }>("git_branch_info", { cwd: proj.path });
      if (activeProjectRef.current?.id !== proj.id) return;
      if (result.ok) {
        setGitBranchInfo({
          current: result.current!,
          upstream: result.upstream ?? null,
          ahead: result.ahead ?? 0,
          behind: result.behind ?? 0,
          detached: result.detached ?? false,
        });
      } else {
        setGitBranchInfo(null);
      }
    } catch {
      setGitBranchInfo(null);
    }
  }, []);

  const [gitDiffStats, setGitDiffStats] = useState<GitDiffStats | null>(null);

  const refreshGitDiffStats = useCallback(async () => {
    const proj = activeProjectRef.current;
    if (!proj) {
      setGitDiffStats(null);
      return;
    }
    try {
      const result = await invoke<{
        ok: boolean;
        additions?: number;
        deletions?: number;
        changedFiles?: number;
      }>("git_diff_stats", { cwd: proj.path });
      if (activeProjectRef.current?.id !== proj.id) return;
      if (result.ok) {
        setGitDiffStats({
          additions: result.additions ?? 0,
          deletions: result.deletions ?? 0,
          changedFiles: result.changedFiles ?? 0,
        });
      } else {
        setGitDiffStats(null);
      }
    } catch {
      setGitDiffStats(null);
    }
  }, []);

  useEffect(() => {
    refreshGitBranchInfo();
    refreshGitDiffStats();
    const interval = setInterval(() => {
      refreshGitBranchInfo();
      refreshGitDiffStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeProject, refreshGitBranchInfo, refreshGitDiffStats]);

  // --- Claude Code per-project status ---
  const [projectClaudeStatus, setProjectClaudeStatus] = useState<
    Map<string, "working" | "idle" | "notification" | "active" | null>
  >(new Map());

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const statuses = await invoke<Record<string, { status: string }>>(
          "get_all_claude_statuses",
          {},
        );

        const tabToProject = new Map<string, string>();
        for (const [projectId, state] of tabManager.projectPanes) {
          for (const pane of state.panes) {
            for (const tab of pane.tabs) {
              tabToProject.set(tab.id, projectId);
            }
          }
        }

        const perProject = new Map<
          string,
          "working" | "idle" | "notification" | null
        >();
        for (const [tabId, { status }] of Object.entries(statuses)) {
          const projectId = tabToProject.get(tabId);
          if (!projectId) continue;
          const current = perProject.get(projectId);
          if (status === "notification") {
            perProject.set(projectId, "notification");
          } else if (status === "working" && current !== "notification") {
            perProject.set(projectId, "working");
          } else if (!current) {
            perProject.set(
              projectId,
              (status as "idle" | "working" | "notification") || "idle",
            );
          }
        }

        setProjectClaudeStatus(perProject);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [tabManager.projectPanes]);

  useEffect(() => {
    const unlisten = listen("claude-notification", () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        osc.onended = () => ctx.close();
      } catch {}
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      setActiveProject,
      addProject,
      removeProject,

      tabs: tabManager.tabs,
      activeTabId: tabManager.activeTabId,
      allTabs: tabManager.allTabs,
      createTab: tabManager.createTab,
      closeTab: tabManager.closeTab,
      closeTabsByFilePath: tabManager.closeTabsByFilePath,
      setActiveTab: tabManager.setActiveTab,
      updateTabTitle: tabManager.updateTabTitle,
      openFileTab: tabManager.openFileTab,
      pinTab: tabManager.pinTab,
      createBrowserTab: tabManager.createBrowserTab,
      updateBrowserUrl: tabManager.updateBrowserUrl,
      createGitTab: tabManager.createGitTab,

      projectPanes: tabManager.projectPanes,
      panes: tabManager.panes,
      focusedPaneId: tabManager.focusedPaneId,
      splitDirection: tabManager.splitDirection,
      splitPane: tabManager.splitPane,
      moveTabToPane: tabManager.moveTabToPane,
      setFocusedPane: tabManager.setFocusedPane,
      unsplit: tabManager.unsplit,

      fileTreeOpen,
      toggleFileTree,
      edityConfig,
      projectConfigs: edityConfigs,
      saveEdityConfig,
      runProject,
      stopProject,
      isProjectRunning,
      gitBranchInfo,
      gitDiffStats,
      refreshGitBranchInfo,
      dirtyTabs: tabManager.dirtyTabs,
      setTabDirty: tabManager.setTabDirty,
      projectClaudeStatus,
    }),
    [
      projects,
      activeProject,
      setActiveProject,
      addProject,
      removeProject,
      tabManager.tabs,
      tabManager.activeTabId,
      tabManager.allTabs,
      tabManager.createTab,
      tabManager.closeTab,
      tabManager.closeTabsByFilePath,
      tabManager.setActiveTab,
      tabManager.updateTabTitle,
      tabManager.openFileTab,
      tabManager.pinTab,
      tabManager.createBrowserTab,
      tabManager.updateBrowserUrl,
      tabManager.createGitTab,
      tabManager.projectPanes,
      tabManager.panes,
      tabManager.focusedPaneId,
      tabManager.splitDirection,
      tabManager.splitPane,
      tabManager.moveTabToPane,
      tabManager.setFocusedPane,
      tabManager.unsplit,
      fileTreeOpen,
      toggleFileTree,
      edityConfig,
      edityConfigs,
      saveEdityConfig,
      runProject,
      stopProject,
      isProjectRunning,
      gitBranchInfo,
      gitDiffStats,
      refreshGitBranchInfo,
      tabManager.dirtyTabs,
      tabManager.setTabDirty,
      projectClaudeStatus,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
