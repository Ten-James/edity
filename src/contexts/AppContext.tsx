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
  ClaudeTab,
} from "@/types/tab";

export type { Tab, AllTab, Pane, SplitDirection, ProjectPaneState, TerminalTab, FileTab, BrowserTab, GitTab, ClaudeTab };

import type { Project, EdityConfig, RunCommand } from "@shared/types/project";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getDefaultRunCommand } from "@/lib/run-commands";
export type { Project, EdityConfig, RunCommand };

interface AppContextValue {
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

  fileTreeOpen: boolean;
  toggleFileTree: () => void;

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
  const { settings } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [edityConfigs, setEdityConfigs] = useState<
    Map<string, EdityConfig | null>
  >(new Map());
  const [runningProjects, setRunningProjects] = useState<
    Map<string, Set<string>>
  >(new Map());

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
        const defaultProject = settings.defaultProjectId
          ? p.find((proj) => proj.id === settings.defaultProjectId)
          : null;
        const initial = defaultProject ?? p[0] ?? null;
        if (initial) {
          setActiveProjectState(initial);
          tabManager.ensureProjectPanes(initial.id);
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

  const reorderProjects = useCallback(
    (fromIndex: number, toIndex: number) => {
      setProjects((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        // Persist new order
        invoke("reorder_projects", { ids: next.map((p) => p.id) }).catch(() => {});
        return next;
      });
    },
    [],
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

  const cleanupExitListener = useCallback((key: string) => {
    const cleanup = exitListenersRef.current.get(key);
    if (cleanup) {
      cleanup();
      exitListenersRef.current.delete(key);
    }
  }, []);

  const addRunningCommand = useCallback((projectId: string, commandId: string) => {
    setRunningProjects((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(projectId) ?? []);
      set.add(commandId);
      next.set(projectId, set);
      return next;
    });
  }, []);

  const removeRunningCommand = useCallback((projectId: string, commandId?: string) => {
    setRunningProjects((prev) => {
      const next = new Map(prev);
      if (!commandId) { next.delete(projectId); return next; }
      const set = new Set(next.get(projectId) ?? []);
      set.delete(commandId);
      if (set.size === 0) next.delete(projectId);
      else next.set(projectId, set);
      return next;
    });
  }, []);

  const runProject = useCallback((command?: RunCommand) => {
    const proj = activeProjectRef.current;
    if (!proj) return;

    const cmd = command ?? getDefaultRunCommand(edityConfigs.get(proj.id) ?? null);
    if (!cmd) return;

    const commandId = cmd.name;

    if (cmd.mode === "background") {
      const key = `${proj.id}:${commandId}`;
      cleanupExitListener(key);
      invoke("run_project_command", {
        projectId: proj.id,
        command: cmd.command,
        cwd: proj.path,
        commandId,
      }).then(() => {
        addRunningCommand(proj.id, commandId);
        toast.success(`Started: ${cmd.name}`);
        listen(`project-run-exit-${key}`, () => {
          removeRunningCommand(proj.id, commandId);
          cleanupExitListener(key);
        }).then((fn) => {
          exitListenersRef.current.set(key, fn);
        });
      });
    } else {
      tabManager.createTab(cmd.command);
    }
  }, [edityConfigs, cleanupExitListener, addRunningCommand, removeRunningCommand, tabManager.createTab]);

  const stopProject = useCallback((commandId?: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;

    if (commandId) {
      cleanupExitListener(`${proj.id}:${commandId}`);
      invoke("kill_project_command", { projectId: proj.id, commandId });
      removeRunningCommand(proj.id, commandId);
      toast.success(`Stopped: ${commandId}`);
    } else {
      const running = runningProjects.get(proj.id);
      if (running) {
        for (const id of running) {
          cleanupExitListener(`${proj.id}:${id}`);
        }
      }
      invoke("kill_project_command", { projectId: proj.id });
      removeRunningCommand(proj.id);
      toast.success("All processes stopped");
    }
  }, [cleanupExitListener, removeRunningCommand, runningProjects]);

  const edityConfig = activeProject
    ? edityConfigs.get(activeProject.id) ?? null
    : null;
  const runningCommandIds = activeProject
    ? runningProjects.get(activeProject.id) ?? new Set<string>()
    : new Set<string>();
  const isProjectRunning = runningCommandIds.size > 0;

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
      reorderProjects,

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
      createClaudeTab: tabManager.createClaudeTab,

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
      runningCommandIds,
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
      reorderProjects,
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
      tabManager.createClaudeTab,
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
      runningCommandIds,
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
