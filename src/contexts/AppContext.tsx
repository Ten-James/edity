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
import type { GitBranchInfo } from "@/types/git";

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

interface BaseTab {
  id: string;
  title: string;
}

export interface TerminalTab extends BaseTab {
  type: "terminal";
  initialCommand?: string;
}

export interface FileTab extends BaseTab {
  type: "file";
  filePath: string;
  isTemporary: boolean;
}

export interface BrowserTab extends BaseTab {
  type: "browser";
  url: string;
}

export interface GitTab extends BaseTab {
  type: "git";
}

export type Tab = TerminalTab | FileTab | BrowserTab | GitTab;

export type AllTab = Tab & {
  projectId: string;
  projectPath: string;
};

interface AppContextValue {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (p: Project) => void;
  addProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  tabs: Tab[];
  activeTabId: string | null;
  allTabs: AllTab[];
  createTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;

  updateTabTitle: (tabId: string, title: string) => void;

  openFileTab: (filePath: string) => void;
  pinTab: (tabId: string) => void;
  createBrowserTab: (initialUrl?: string) => string;
  updateBrowserUrl: (tabId: string, url: string) => void;
  createGitTab: () => void;

  fileTreeOpen: boolean;
  toggleFileTree: () => void;

  edityConfig: EdityConfig | null;
  projectConfigs: Map<string, EdityConfig | null>;
  saveEdityConfig: (config: EdityConfig, projectPath: string) => Promise<void>;
  runProject: () => void;
  stopProject: () => void;
  isProjectRunning: boolean;

  gitBranchInfo: GitBranchInfo | null;
  refreshGitBranchInfo: () => Promise<void>;

  projectClaudeStatus: Map<string, "working" | "idle" | "notification" | "active" | null>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

let globalTabCounter = 0;

function makeTerminalTab(): TerminalTab {
  globalTabCounter += 1;
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${globalTabCounter}`,
    type: "terminal",
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);

  const [projectTabs, setProjectTabs] = useState<
    Map<string, { tabs: Tab[]; activeTabId: string | null }>
  >(new Map());

  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [edityConfigs, setEdityConfigs] = useState<
    Map<string, EdityConfig | null>
  >(new Map());
  const [runningProjects, setRunningProjects] = useState<Set<string>>(
    new Set(),
  );

  const ensureProjectTabs = useCallback(
    (projectId: string) => {
      setProjectTabs((prev) => {
        if (prev.has(projectId)) return prev;
        const next = new Map(prev);
        const tab = makeTerminalTab();
        next.set(projectId, { tabs: [tab], activeTabId: tab.id });
        return next;
      });
    },
    [],
  );

  const loadEdityConfig = useCallback(
    async (project: Project) => {
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
    },
    [],
  );

  useEffect(() => {
    invoke<Project[]>("get_projects")
      .then((p) => {
        setProjects(p);
        if (p.length > 0) {
          setActiveProjectState(p[0]);
          const tab = makeTerminalTab();
          setProjectTabs(
            new Map([[p[0].id, { tabs: [tab], activeTabId: tab.id }]]),
          );
        }
        // Load edity configs for all projects
        p.forEach((project) => loadEdityConfig(project));
      })
      .catch(() => {});
  }, [loadEdityConfig]);

  const setActiveProject = useCallback(
    (p: Project) => {
      setActiveProjectState(p);
      ensureProjectTabs(p.id);
    },
    [ensureProjectTabs],
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
    const tab = makeTerminalTab();
    setProjectTabs((prev) => {
      const next = new Map(prev);
      next.set(project.id, { tabs: [tab], activeTabId: tab.id });
      return next;
    });
    loadEdityConfig(project);
  }, [loadEdityConfig]);

  const removeProject = useCallback(async (id: string) => {
    await invoke("remove_project", { id });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setProjectTabs((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setActiveProjectState((current) => (current?.id === id ? null : current));
  }, []);

  const currentTabState = activeProject
    ? projectTabs.get(activeProject.id)
    : undefined;

  const tabs = currentTabState?.tabs ?? [];
  const activeTabId = currentTabState?.activeTabId ?? null;

  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;

  const setActiveTab = useCallback(
    (tabId: string) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      setProjectTabs((prev) => {
        const state = prev.get(proj.id);
        if (!state) return prev;
        const next = new Map(prev);
        next.set(proj.id, { ...state, activeTabId: tabId });
        return next;
      });
    },
    [],
  );

  const createTab = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) {
      const tab = makeTerminalTab();
      return tab.id;
    }
    const tab = makeTerminalTab();
    setProjectTabs((prev) => {
      const state = prev.get(proj.id) ?? { tabs: [], activeTabId: null };
      const next = new Map(prev);
      next.set(proj.id, {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      });
      return next;
    });
    return tab.id;
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      setProjectTabs((prev) => {
        const state = prev.get(proj.id);
        if (!state) return prev;

        const closingTab = state.tabs.find((t) => t.id === id);
        if (closingTab?.type === "file") {
          invoke("unwatch_file", { tabId: id }).catch(() => {});
        }

        const remaining = state.tabs.filter((t) => t.id !== id);
        const next = new Map(prev);

        if (remaining.length === 0) {
          const newTab = makeTerminalTab();
          next.set(proj.id, { tabs: [newTab], activeTabId: newTab.id });
        } else {
          let newActive = state.activeTabId;
          if (state.activeTabId === id) {
            const closedIdx = state.tabs.findIndex((t) => t.id === id);
            newActive =
              remaining[Math.min(closedIdx, remaining.length - 1)]?.id ?? null;
          }
          next.set(proj.id, { tabs: remaining, activeTabId: newActive });
        }
        return next;
      });
    },
    [],
  );

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setProjectTabs((prev) => {
      for (const [projectId, state] of prev) {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab) {
          if (tab.title === title) return prev;
          const next = new Map(prev);
          next.set(projectId, {
            ...state,
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, title } : t,
            ),
          });
          return next;
        }
      }
      return prev;
    });
  }, []);

  const openFileTab = useCallback((filePath: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;

    const title = filePath.split("/").pop() ?? "File";

    setProjectTabs((prev) => {
      const state = prev.get(proj.id) ?? { tabs: [], activeTabId: null };
      const next = new Map(prev);

      const tempIdx = state.tabs.findIndex(
        (t) => t.type === "file" && t.isTemporary,
      );

      const newTab: FileTab = {
        id: crypto.randomUUID(),
        title,
        type: "file",
        filePath,
        isTemporary: true,
      };

      if (tempIdx !== -1) {
        const oldTab = state.tabs[tempIdx];
        if (oldTab.type === "file") {
          invoke("unwatch_file", { tabId: oldTab.id }).catch(() => {});
        }
        const newTabs = [...state.tabs];
        newTabs[tempIdx] = newTab;
        next.set(proj.id, { tabs: newTabs, activeTabId: newTab.id });
      } else {
        next.set(proj.id, {
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        });
      }

      return next;
    });
  }, []);

  const pinTab = useCallback((tabId: string) => {
    setProjectTabs((prev) => {
      for (const [projectId, state] of prev) {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab && tab.type === "file" && tab.isTemporary) {
          const next = new Map(prev);
          next.set(projectId, {
            ...state,
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, isTemporary: false } : t,
            ),
          });
          return next;
        }
      }
      return prev;
    });
  }, []);

  const createBrowserTab = useCallback((initialUrl?: string) => {
    const proj = activeProjectRef.current;
    const tab: BrowserTab = {
      id: crypto.randomUUID(),
      title: "New Tab",
      type: "browser",
      url: initialUrl ?? "https://www.google.com",
    };
    if (!proj) return tab.id;

    setProjectTabs((prev) => {
      const state = prev.get(proj.id) ?? { tabs: [], activeTabId: null };
      const next = new Map(prev);
      next.set(proj.id, {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      });
      return next;
    });
    return tab.id;
  }, []);

  const createGitTab = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;

    // Only allow one git tab per project — reactivate existing
    setProjectTabs((prev) => {
      const state = prev.get(proj.id) ?? { tabs: [], activeTabId: null };
      const existing = state.tabs.find((t) => t.type === "git");
      if (existing) {
        const next = new Map(prev);
        next.set(proj.id, { ...state, activeTabId: existing.id });
        return next;
      }
      const tab: GitTab = {
        id: crypto.randomUUID(),
        title: "Git",
        type: "git",
      };
      const next = new Map(prev);
      next.set(proj.id, {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      });
      return next;
    });
  }, []);

  const updateBrowserUrl = useCallback((tabId: string, url: string) => {
    setProjectTabs((prev) => {
      for (const [projectId, state] of prev) {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab && tab.type === "browser") {
          if (tab.url === url) return prev;
          const next = new Map(prev);
          next.set(projectId, {
            ...state,
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, url } : t,
            ),
          });
          return next;
        }
      }
      return prev;
    });
  }, []);

  const saveEdityConfig = useCallback(
    async (config: EdityConfig, projectPath: string) => {
      await invoke("write_edity_config", { projectPath, config });
      // Find project by path and update cache
      const project = projects.find((p) => p.path === projectPath);
      if (project) {
        setEdityConfigs((prev) => {
          const next = new Map(prev);
          next.set(project.id, config);
          return next;
        });
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
      // Terminal mode: create a new terminal tab with initialCommand
      const tab: TerminalTab = {
        ...makeTerminalTab(),
        initialCommand: config.runCommand,
      };
      setProjectTabs((prev) => {
        const state = prev.get(proj.id) ?? { tabs: [], activeTabId: null };
        const next = new Map(prev);
        next.set(proj.id, {
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        });
        return next;
      });
    }
  }, [edityConfigs, cleanupExitListener]);

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
  }, [cleanupExitListener]);

  const edityConfig = activeProject
    ? edityConfigs.get(activeProject.id) ?? null
    : null;
  const isProjectRunning = activeProject
    ? runningProjects.has(activeProject.id)
    : false;

  const toggleFileTree = useCallback(
    () => setFileTreeOpen((v) => !v),
    [],
  );

  // Git branch info polling
  const [gitBranchInfo, setGitBranchInfo] = useState<GitBranchInfo | null>(
    null,
  );

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
        error?: string;
      }>("git_branch_info", { cwd: proj.path });
      // Guard against stale response if project switched during await
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

  useEffect(() => {
    refreshGitBranchInfo();
    const interval = setInterval(refreshGitBranchInfo, 10000);
    return () => clearInterval(interval);
  }, [activeProject, refreshGitBranchInfo]);

  const allTabs = useMemo(() => {
    const result: AllTab[] = [];
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    for (const [projectId, state] of projectTabs) {
      const project = projectMap.get(projectId);
      if (!project) continue;
      for (const tab of state.tabs) {
        result.push({ ...tab, projectId, projectPath: project.path } as AllTab);
      }
    }
    return result;
  }, [projects, projectTabs]);

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

        // Build tab→project mapping
        const tabToProject = new Map<string, string>();
        for (const [projectId, state] of projectTabs) {
          for (const tab of state.tabs) {
            tabToProject.set(tab.id, projectId);
          }
        }

        // Aggregate statuses per project
        const perProject = new Map<string, "working" | "idle" | "notification" | null>();
        for (const [tabId, { status }] of Object.entries(statuses)) {
          const projectId = tabToProject.get(tabId);
          if (!projectId) continue;
          const current = perProject.get(projectId);
          // Priority: notification > working > idle
          if (status === "notification") {
            perProject.set(projectId, "notification");
          } else if (status === "working" && current !== "notification") {
            perProject.set(projectId, "working");
          } else if (!current) {
            perProject.set(projectId, (status as "idle" | "working" | "notification") || "idle");
          }
        }

        setProjectClaudeStatus(perProject);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [projectTabs]);

  // Listen for Claude notification events and play beep
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
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      setActiveProject,
      addProject,
      removeProject,
      tabs,
      activeTabId,
      allTabs,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      openFileTab,
      pinTab,
      createBrowserTab,
      updateBrowserUrl,
      createGitTab,
      fileTreeOpen,
      toggleFileTree,
      edityConfig,
      projectConfigs: edityConfigs,
      saveEdityConfig,
      runProject,
      stopProject,
      isProjectRunning,
      gitBranchInfo,
      refreshGitBranchInfo,
      projectClaudeStatus,
    }),
    [
      projects,
      activeProject,
      setActiveProject,
      addProject,
      removeProject,
      tabs,
      activeTabId,
      allTabs,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      openFileTab,
      pinTab,
      createBrowserTab,
      updateBrowserUrl,
      createGitTab,
      fileTreeOpen,
      toggleFileTree,
      edityConfig,
      edityConfigs,
      saveEdityConfig,
      runProject,
      stopProject,
      isProjectRunning,
      gitBranchInfo,
      refreshGitBranchInfo,
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
