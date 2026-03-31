import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@/lib/ipc";
import type { Project } from "@/contexts/AppContext";
import type {
  Tab,
  TerminalTab,
  FileTab,
  BrowserTab,
  GitTab,
  ClaudeTab,
  AllTab,
  Pane,
  SplitDirection,
  ProjectPaneState,
} from "@/types/tab";

let globalTabCounter = 0;

function makeTerminalTab(initialCommand?: string): TerminalTab {
  globalTabCounter += 1;
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${globalTabCounter}`,
    type: "terminal",
    initialCommand,
  };
}

function makePane(tabs?: Tab[]): Pane {
  const paneTabs = tabs ?? [];
  return {
    id: crypto.randomUUID(),
    tabs: paneTabs,
    activeTabId: paneTabs[0]?.id ?? null,
  };
}

function makeDefaultState(): ProjectPaneState {
  const pane = makePane();
  return {
    panes: [pane],
    focusedPaneId: pane.id,
    splitDirection: "horizontal",
  };
}

/** Find which pane contains a tab, across all panes in a project state. */
function findPaneForTab(
  state: ProjectPaneState,
  tabId: string,
): Pane | undefined {
  return state.panes.find((p) => p.tabs.some((t) => t.id === tabId));
}

function updatePaneInState(
  state: ProjectPaneState,
  paneId: string,
  updater: (pane: Pane) => Pane,
): ProjectPaneState {
  return {
    ...state,
    panes: state.panes.map((p) => (p.id === paneId ? updater(p) : p)),
  };
}

/** Remove a single tab from project pane state. Returns unchanged state if tab not found. */
function removeTabFromState(
  state: ProjectPaneState,
  tabId: string,
): ProjectPaneState {
  const pane = findPaneForTab(state, tabId);
  if (!pane) return state;
  const remaining = pane.tabs.filter((t) => t.id !== tabId);
  if (remaining.length === 0) {
    if (state.panes.length > 1) {
      const otherPanes = state.panes.filter((p) => p.id !== pane.id);
      return { ...state, panes: otherPanes, focusedPaneId: otherPanes[0].id };
    }
    return updatePaneInState(state, pane.id, () => ({
      ...pane,
      tabs: [],
      activeTabId: null,
    }));
  }
  let newActive = pane.activeTabId;
  if (pane.activeTabId === tabId) {
    const closedIdx = pane.tabs.findIndex((t) => t.id === tabId);
    newActive =
      remaining[Math.min(closedIdx, remaining.length - 1)]?.id ?? null;
  }
  return updatePaneInState(state, pane.id, () => ({
    ...pane,
    tabs: remaining,
    activeTabId: newActive,
  }));
}

/** Find a tab across all projects and update it. Returns prev if not found or updater returns null. */
function updateTabAcrossProjects(
  prev: Map<string, ProjectPaneState>,
  tabId: string,
  updater: (tab: Tab) => Tab | null,
): Map<string, ProjectPaneState> {
  for (const [projectId, state] of prev) {
    const pane = findPaneForTab(state, tabId);
    if (!pane) continue;
    const tab = pane.tabs.find((t) => t.id === tabId);
    if (!tab) continue;
    const updated = updater(tab);
    if (!updated) return prev;
    const next = new Map(prev);
    next.set(
      projectId,
      updatePaneInState(state, pane.id, (p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === tabId ? updated : t)),
      })),
    );
    return next;
  }
  return prev;
}

/** Activate existing singleton tab or create a new one. */
function openOrCreateSingletonTab(
  prev: Map<string, ProjectPaneState>,
  projectId: string,
  predicate: (tab: Tab) => boolean,
  factory: () => Tab,
): Map<string, ProjectPaneState> {
  const state = prev.get(projectId) ?? makeDefaultState();
  for (const pane of state.panes) {
    const existing = pane.tabs.find(predicate);
    if (existing) {
      const next = new Map(prev);
      next.set(projectId, {
        ...updatePaneInState(state, pane.id, (p) => ({
          ...p,
          activeTabId: existing.id,
        })),
        focusedPaneId: pane.id,
      });
      return next;
    }
  }
  return addTabToFocusedPane(prev, projectId, factory());
}

/** Add a tab to the focused pane of a project. */
function addTabToFocusedPane(
  prev: Map<string, ProjectPaneState>,
  projectId: string,
  tab: Tab,
): Map<string, ProjectPaneState> {
  const state = prev.get(projectId) ?? makeDefaultState();
  const next = new Map(prev);
  next.set(
    projectId,
    updatePaneInState(state, state.focusedPaneId, (p) => ({
      ...p,
      tabs: [...p.tabs, tab],
      activeTabId: tab.id,
    })),
  );
  return next;
}

export function useTabManager(
  activeProject: Project | null,
  projects: Project[],
) {
  const [projectPanes, setProjectPanes] = useState<
    Map<string, ProjectPaneState>
  >(new Map());

  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set());

  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;

  // --- Helpers ---

  const setTabDirty = useCallback((tabId: string, dirty: boolean) => {
    setDirtyTabs((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(tabId);
      else next.delete(tabId);
      return next;
    });
  }, []);

  const ensureProjectPanes = useCallback((projectId: string) => {
    setProjectPanes((prev) => {
      if (prev.has(projectId)) return prev;
      const next = new Map(prev);
      next.set(projectId, makeDefaultState());
      return next;
    });
  }, []);

  const initProjectPanes = useCallback(
    (projectId: string, state: ProjectPaneState) => {
      setProjectPanes((prev) => {
        const next = new Map(prev);
        next.set(projectId, state);
        return next;
      });
    },
    [],
  );

  const removeProjectPanes = useCallback((projectId: string) => {
    setProjectPanes((prev) => {
      const next = new Map(prev);
      next.delete(projectId);
      return next;
    });
  }, []);

  // --- Derived state for current project ---

  const currentState = activeProject
    ? projectPanes.get(activeProject.id)
    : undefined;

  const panes = currentState?.panes ?? [];
  const focusedPaneId = currentState?.focusedPaneId ?? null;
  const splitDirection = currentState?.splitDirection ?? "horizontal";

  // Focused pane's tabs and activeTabId (backward compat with single-pane consumers)
  const focusedPane = panes.find((p) => p.id === focusedPaneId) ?? panes[0];
  const tabs = focusedPane?.tabs ?? [];
  const activeTabId = focusedPane?.activeTabId ?? null;

  // --- Tab actions ---

  const setActiveTab = useCallback((tabId: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) => {
      const state = prev.get(proj.id);
      if (!state) return prev;
      const pane = findPaneForTab(state, tabId);
      if (!pane) return prev;
      if (pane.activeTabId === tabId) return prev;
      const next = new Map(prev);
      next.set(proj.id, updatePaneInState(state, pane.id, (p) => ({
        ...p,
        activeTabId: tabId,
      })));
      return next;
    });
  }, []);

  const createTab = useCallback((initialCommand?: string) => {
    const proj = activeProjectRef.current;
    const tab = initialCommand ? makeTerminalTab(initialCommand) : makeTerminalTab();
    if (!proj) return tab.id;

    setProjectPanes((prev) => addTabToFocusedPane(prev, proj.id, tab));
    return tab.id;
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      setProjectPanes((prev) => {
        const state = prev.get(proj.id);
        if (!state) return prev;

        const pane = findPaneForTab(state, id);
        if (!pane) return prev;

        const closingTab = pane.tabs.find((t) => t.id === id);
        if (closingTab?.type === "file") {
          invoke("unwatch_file", { tabId: id }).catch(() => {});
          setTabDirty(id, false);
        }

        const next = new Map(prev);
        next.set(proj.id, removeTabFromState(state, id));
        return next;
      });
    },
    [setTabDirty],
  );

  const closeTabsByFilePath = useCallback(
    (filePath: string) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      setProjectPanes((prev) => {
        const state = prev.get(proj.id);
        if (!state) return prev;
        // Find all tabs matching this path (exact match or inside directory)
        const matchingIds: string[] = [];
        for (const pane of state.panes) {
          for (const tab of pane.tabs) {
            if (
              tab.type === "file" &&
              (tab.filePath === filePath ||
                tab.filePath.startsWith(filePath + "/"))
            ) {
              matchingIds.push(tab.id);
            }
          }
        }
        if (matchingIds.length === 0) return prev;
        const next = new Map(prev);
        let currentState = state;
        for (const id of matchingIds) {
          invoke("unwatch_file", { tabId: id }).catch(() => {});
          setTabDirty(id, false);
          currentState = removeTabFromState(currentState, id);
        }
        next.set(proj.id, currentState);
        return next;
      });
    },
    [setTabDirty],
  );

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setProjectPanes((prev) =>
      updateTabAcrossProjects(prev, tabId, (tab) =>
        tab.title === title ? null : { ...tab, title },
      ),
    );
  }, []);

  const openFileTab = useCallback((filePath: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;

    const title = filePath.split("/").pop() ?? "File";

    setProjectPanes((prev) => {
      const state = prev.get(proj.id) ?? makeDefaultState();
      const targetPaneId = state.focusedPaneId;
      const targetPane = state.panes.find((p) => p.id === targetPaneId) ??
        state.panes[0];
      if (!targetPane) return prev;

      // Check if file is already open in any pane
      for (const p of state.panes) {
        const existing = p.tabs.find(
          (t) => t.type === "file" && t.filePath === filePath,
        );
        if (existing) {
          const next = new Map(prev);
          next.set(
            proj.id,
            updatePaneInState(state, p.id, (pn) => ({
              ...pn,
              activeTabId: existing.id,
            })),
          );
          return next;
        }
      }

      const newTab: FileTab = {
        id: crypto.randomUUID(),
        title,
        type: "file",
        filePath,
        isTemporary: true,
      };

      // Replace temporary file tab in focused pane
      const tempIdx = targetPane.tabs.findIndex(
        (t) => t.type === "file" && t.isTemporary,
      );

      const next = new Map(prev);
      if (tempIdx !== -1) {
        const oldTab = targetPane.tabs[tempIdx];
        if (oldTab.type === "file") {
          invoke("unwatch_file", { tabId: oldTab.id }).catch(() => {});
        }
        const newTabs = [...targetPane.tabs];
        newTabs[tempIdx] = newTab;
        next.set(
          proj.id,
          updatePaneInState(state, targetPane.id, (p) => ({
            ...p,
            tabs: newTabs,
            activeTabId: newTab.id,
          })),
        );
      } else {
        next.set(
          proj.id,
          updatePaneInState(state, targetPane.id, (p) => ({
            ...p,
            tabs: [...p.tabs, newTab],
            activeTabId: newTab.id,
          })),
        );
      }
      return next;
    });
  }, []);

  const pinTab = useCallback((tabId: string) => {
    setProjectPanes((prev) =>
      updateTabAcrossProjects(prev, tabId, (tab) =>
        tab.type === "file" && tab.isTemporary
          ? { ...tab, isTemporary: false }
          : null,
      ),
    );
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

    setProjectPanes((prev) => addTabToFocusedPane(prev, proj.id, tab));
    return tab.id;
  }, []);

  const createGitTab = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) =>
      openOrCreateSingletonTab(
        prev,
        proj.id,
        (t) => t.type === "git",
        (): GitTab => ({ id: crypto.randomUUID(), title: "Git", type: "git" }),
      ),
    );
  }, []);

  const createClaudeTab = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) =>
      openOrCreateSingletonTab(
        prev,
        proj.id,
        (t) => t.type === "claude",
        (): ClaudeTab => ({ id: crypto.randomUUID(), title: "Claude", type: "claude" }),
      ),
    );
  }, []);

  const updateBrowserUrl = useCallback((tabId: string, url: string) => {
    setProjectPanes((prev) =>
      updateTabAcrossProjects(prev, tabId, (tab) =>
        tab.type === "browser" && tab.url !== url ? { ...tab, url } : null,
      ),
    );
  }, []);

  // --- Pane actions ---

  const setFocusedPane = useCallback((paneId: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) => {
      const state = prev.get(proj.id);
      if (!state || state.focusedPaneId === paneId) return prev;
      const next = new Map(prev);
      next.set(proj.id, { ...state, focusedPaneId: paneId });
      return next;
    });
  }, []);

  const splitPane = useCallback(
    (direction: SplitDirection, tabId?: string) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      setProjectPanes((prev) => {
        const state = prev.get(proj.id);
        if (!state || state.panes.length >= 2) return prev;

        const sourcePaneId = state.focusedPaneId;
        const sourcePane = state.panes.find((p) => p.id === sourcePaneId);
        if (!sourcePane) return prev;

        let newPaneTabs: Tab[] | undefined;
        let updatedSourcePane = sourcePane;

        if (tabId) {
          const tab = sourcePane.tabs.find((t) => t.id === tabId);
          if (tab) {
            newPaneTabs = [tab];
            const remaining = sourcePane.tabs.filter((t) => t.id !== tabId);
            const newTabs =
              remaining.length > 0 ? remaining : [makeTerminalTab()];
            const newActive =
              remaining.length > 0 && sourcePane.activeTabId !== tabId
                ? sourcePane.activeTabId
                : newTabs[0].id;
            updatedSourcePane = {
              ...sourcePane,
              tabs: newTabs,
              activeTabId: newActive,
            };
          }
        }

        const newPane = makePane(newPaneTabs);
        const next = new Map(prev);
        next.set(proj.id, {
          panes: [updatedSourcePane, newPane],
          focusedPaneId: newPane.id,
          splitDirection: direction,
        });
        return next;
      });
    },
    [],
  );

  const moveTabToPane = useCallback((tabId: string, targetPaneId: string) => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) => {
      const state = prev.get(proj.id);
      if (!state) return prev;

      const sourcePane = findPaneForTab(state, tabId);
      if (!sourcePane || sourcePane.id === targetPaneId) return prev;

      const targetPane = state.panes.find((p) => p.id === targetPaneId);
      if (!targetPane) return prev;

      const tab = sourcePane.tabs.find((t) => t.id === tabId)!;
      const remainingSource = sourcePane.tabs.filter((t) => t.id !== tabId);

      let newSourceActive = sourcePane.activeTabId;
      if (sourcePane.activeTabId === tabId) {
        newSourceActive = remainingSource[0]?.id ?? null;
      }

      const next = new Map(prev);

      // If source pane becomes empty, remove it
      if (remainingSource.length === 0) {
        next.set(proj.id, {
          ...state,
          panes: state.panes
            .filter((p) => p.id !== sourcePane.id)
            .map((p) =>
              p.id === targetPaneId
                ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id }
                : p,
            ),
          focusedPaneId: targetPaneId,
        });
      } else {
        let updated = updatePaneInState(state, sourcePane.id, () => ({
          ...sourcePane,
          tabs: remainingSource,
          activeTabId: newSourceActive,
        }));
        updated = updatePaneInState(updated, targetPaneId, (p) => ({
          ...p,
          tabs: [...p.tabs, tab],
          activeTabId: tab.id,
        }));
        next.set(proj.id, updated);
      }
      return next;
    });
  }, []);

  const unsplit = useCallback(() => {
    const proj = activeProjectRef.current;
    if (!proj) return;
    setProjectPanes((prev) => {
      const state = prev.get(proj.id);
      if (!state || state.panes.length <= 1) return prev;

      const allTabsMerged: Tab[] = [];
      let mergedActiveTabId: string | null = null;
      for (const pane of state.panes) {
        allTabsMerged.push(...pane.tabs);
        if (pane.id === state.focusedPaneId) {
          mergedActiveTabId = pane.activeTabId;
        }
      }

      const merged = makePane(allTabsMerged);
      merged.activeTabId = mergedActiveTabId ?? allTabsMerged[0]?.id ?? null;

      const next = new Map(prev);
      next.set(proj.id, {
        panes: [merged],
        focusedPaneId: merged.id,
        splitDirection: state.splitDirection,
      });
      return next;
    });
  }, []);

  // --- Computed: allTabs with paneId ---

  const allTabs = useMemo(() => {
    const result: AllTab[] = [];
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    for (const [projectId, state] of projectPanes) {
      const project = projectMap.get(projectId);
      if (!project) continue;
      for (const pane of state.panes) {
        for (const tab of pane.tabs) {
          result.push({
            ...tab,
            projectId,
            projectPath: project.path,
            paneId: pane.id,
          } as AllTab);
        }
      }
    }
    return result;
  }, [projects, projectPanes]);

  return {
    // State
    projectPanes,
    panes,
    focusedPaneId,
    splitDirection,
    tabs,
    activeTabId,
    allTabs,
    dirtyTabs,

    // Tab actions
    createTab,
    closeTab,
    closeTabsByFilePath,
    setActiveTab,
    openFileTab,
    pinTab,
    createBrowserTab,
    createGitTab,
    createClaudeTab,
    updateTabTitle,
    updateBrowserUrl,
    setTabDirty,

    // Pane actions
    setFocusedPane,
    splitPane,
    moveTabToPane,
    unsplit,

    // Project-level pane management
    ensureProjectPanes,
    initProjectPanes,
    removeProjectPanes,
  };
}
