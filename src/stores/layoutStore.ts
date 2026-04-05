import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { useProjectStore } from "./projectStore";
import type {
  Tab,
  TerminalTab,
  FileTab,
  BrowserTab,
  GitTab,
  ClaudeTab,
  DataTab,
  EventLogTab,
  AllTab,
  Pane,
  ProjectPaneState,
} from "@/types/tab";

// ─── Pure helpers (lifted from useTabManager.ts) ────────────────

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

// ─── Store ──────────────────────────────────────────────────────

interface LayoutState {
  projectPanes: Map<string, ProjectPaneState>;
  sidebarPanel: "files" | "git" | null;
  dirtyTabs: Set<string>;
}

export const useLayoutStore = create<LayoutState>(() => ({
  projectPanes: new Map(),
  sidebarPanel: null,
  dirtyTabs: new Set(),
}));

// ─── Selectors ──────────────────────────────────────────────────

export function useCurrentPaneState(): ProjectPaneState | undefined {
  const activeProject = useProjectStore((s) => s.activeProject);
  return useLayoutStore((s) =>
    activeProject ? s.projectPanes.get(activeProject.id) : undefined,
  );
}

export function useAllTabs(): AllTab[] {
  const projects = useProjectStore((s) => s.projects);
  const projectPanes = useLayoutStore((s) => s.projectPanes);

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
}

// ─── Helpers ────────────────────────────────────────────────────

function getActiveProjectId(): string | null {
  return useProjectStore.getState().activeProject?.id ?? null;
}

function updateProjectPanes(
  updater: (
    prev: Map<string, ProjectPaneState>,
    projectId: string,
  ) => Map<string, ProjectPaneState>,
) {
  const projectId = getActiveProjectId();
  if (!projectId) return;
  useLayoutStore.setState((s) => ({
    projectPanes: updater(s.projectPanes, projectId),
  }));
}

// ─── Event listener ─────────────────────────────────────────────

subscribe((event) => {
  switch (event.type) {
    // ── Project lifecycle ──
    case "project-switch": {
      useLayoutStore.setState((s) => {
        if (s.projectPanes.has(event.projectId)) return s;
        const next = new Map(s.projectPanes);
        next.set(event.projectId, makeDefaultState());
        return { projectPanes: next };
      });
      break;
    }

    case "project-remove": {
      useLayoutStore.setState((s) => {
        const next = new Map(s.projectPanes);
        next.delete(event.projectId);
        return { projectPanes: next };
      });
      break;
    }

    // ── Tab creation ──
    case "tab-create-terminal": {
      const tab = makeTerminalTab(event.initialCommand);
      updateProjectPanes((prev, pid) => addTabToFocusedPane(prev, pid, tab));
      break;
    }

    case "tab-open-file": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      const filePath = event.filePath;
      const title = filePath.split("/").pop() ?? "File";

      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId) ?? makeDefaultState();
        const targetPaneId = state.focusedPaneId;
        const targetPane =
          state.panes.find((p) => p.id === targetPaneId) ?? state.panes[0];
        if (!targetPane) return s;

        // Check if file already open in any pane
        for (const p of state.panes) {
          const existing = p.tabs.find(
            (t) => t.type === "file" && t.filePath === filePath,
          );
          if (existing) {
            const next = new Map(s.projectPanes);
            next.set(
              projectId,
              updatePaneInState(state, p.id, (pn) => ({
                ...pn,
                activeTabId: existing.id,
              })),
            );
            return { projectPanes: next };
          }
        }

        const newTab: FileTab = {
          id: crypto.randomUUID(),
          title,
          type: "file",
          filePath,
          isTemporary: true,
        };

        const tempIdx = targetPane.tabs.findIndex(
          (t) => t.type === "file" && t.isTemporary,
        );
        const next = new Map(s.projectPanes);

        if (tempIdx !== -1) {
          const oldTab = targetPane.tabs[tempIdx];
          if (oldTab.type === "file") {
            invoke("unwatch_file", { tabId: oldTab.id }).catch(() => {});
          }
          const newTabs = [...targetPane.tabs];
          newTabs[tempIdx] = newTab;
          next.set(
            projectId,
            updatePaneInState(state, targetPane.id, (p) => ({
              ...p,
              tabs: newTabs,
              activeTabId: newTab.id,
            })),
          );
        } else {
          next.set(
            projectId,
            updatePaneInState(state, targetPane.id, (p) => ({
              ...p,
              tabs: [...p.tabs, newTab],
              activeTabId: newTab.id,
            })),
          );
        }
        return { projectPanes: next };
      });
      break;
    }

    case "tab-create-browser": {
      const tab: BrowserTab = {
        id: crypto.randomUUID(),
        title: "New Tab",
        type: "browser",
        url: event.initialUrl ?? "https://www.google.com",
      };
      updateProjectPanes((prev, pid) => addTabToFocusedPane(prev, pid, tab));
      break;
    }

    case "tab-create-git": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => ({
        projectPanes: openOrCreateSingletonTab(
          s.projectPanes,
          projectId,
          (t) => t.type === "git",
          (): GitTab => ({
            id: crypto.randomUUID(),
            title: "Git",
            type: "git",
          }),
        ),
      }));
      break;
    }

    case "tab-create-claude": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => ({
        projectPanes: openOrCreateSingletonTab(
          s.projectPanes,
          projectId,
          (t) => t.type === "claude",
          (): ClaudeTab => ({
            id: crypto.randomUUID(),
            title: "Claude",
            type: "claude",
          }),
        ),
      }));
      break;
    }

    case "tab-create-data": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => ({
        projectPanes: openOrCreateSingletonTab(
          s.projectPanes,
          projectId,
          (t) => t.type === "data",
          (): DataTab => ({
            id: crypto.randomUUID(),
            title: "Data",
            type: "data",
            connectionId: event.connectionId,
          }),
        ),
      }));
      break;
    }

    case "tab-create-event-log": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => ({
        projectPanes: openOrCreateSingletonTab(
          s.projectPanes,
          projectId,
          (t) => t.type === "event-log",
          (): EventLogTab => ({
            id: crypto.randomUUID(),
            title: "Event Log",
            type: "event-log",
          }),
        ),
      }));
      break;
    }

    // ── Tab operations ──
    case "tab-close": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;
        const pane = findPaneForTab(state, event.tabId);
        if (!pane) return s;
        const closingTab = pane.tabs.find((t) => t.id === event.tabId);
        if (closingTab?.type === "file") {
          invoke("unwatch_file", { tabId: event.tabId }).catch(() => {});
        }
        const next = new Map(s.projectPanes);
        next.set(projectId, removeTabFromState(state, event.tabId));
        const nextDirty = new Set(s.dirtyTabs);
        nextDirty.delete(event.tabId);
        return { projectPanes: next, dirtyTabs: nextDirty };
      });
      break;
    }

    case "tab-close-by-filepath": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;
        const matchingIds: string[] = [];
        for (const pane of state.panes) {
          for (const tab of pane.tabs) {
            if (
              tab.type === "file" &&
              (tab.filePath === event.filePath ||
                tab.filePath.startsWith(event.filePath + "/"))
            ) {
              matchingIds.push(tab.id);
            }
          }
        }
        if (matchingIds.length === 0) return s;
        const next = new Map(s.projectPanes);
        const nextDirty = new Set(s.dirtyTabs);
        let currentState = state;
        for (const id of matchingIds) {
          invoke("unwatch_file", { tabId: id }).catch(() => {});
          nextDirty.delete(id);
          currentState = removeTabFromState(currentState, id);
        }
        next.set(projectId, currentState);
        return { projectPanes: next, dirtyTabs: nextDirty };
      });
      break;
    }

    case "tab-set-active": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;
        const pane = findPaneForTab(state, event.tabId);
        if (!pane || pane.activeTabId === event.tabId) return s;
        const next = new Map(s.projectPanes);
        next.set(
          projectId,
          updatePaneInState(state, pane.id, (p) => ({
            ...p,
            activeTabId: event.tabId,
          })),
        );
        return { projectPanes: next };
      });
      break;
    }

    case "tab-next":
    case "tab-prev": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      const direction = event.type === "tab-next" ? 1 : -1;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;
        const pane =
          state.panes.find((p) => p.id === state.focusedPaneId) ??
          state.panes[0];
        if (!pane || pane.tabs.length < 2 || !pane.activeTabId) return s;
        const idx = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
        const nextTab =
          pane.tabs[(idx + direction + pane.tabs.length) % pane.tabs.length];
        const next = new Map(s.projectPanes);
        next.set(
          projectId,
          updatePaneInState(state, pane.id, (p) => ({
            ...p,
            activeTabId: nextTab.id,
          })),
        );
        return { projectPanes: next };
      });
      break;
    }

    case "tab-pin": {
      useLayoutStore.setState((s) => ({
        projectPanes: updateTabAcrossProjects(
          s.projectPanes,
          event.tabId,
          (tab) =>
            tab.type === "file" && tab.isTemporary
              ? { ...tab, isTemporary: false }
              : null,
        ),
      }));
      break;
    }

    case "tab-update-title": {
      useLayoutStore.setState((s) => ({
        projectPanes: updateTabAcrossProjects(
          s.projectPanes,
          event.tabId,
          (tab) =>
            tab.title === event.title ? null : { ...tab, title: event.title },
        ),
      }));
      break;
    }

    case "tab-update-browser-url": {
      useLayoutStore.setState((s) => ({
        projectPanes: updateTabAcrossProjects(
          s.projectPanes,
          event.tabId,
          (tab) =>
            tab.type === "browser" && tab.url !== event.url
              ? { ...tab, url: event.url }
              : null,
        ),
      }));
      break;
    }

    case "tab-set-dirty": {
      useLayoutStore.setState((s) => {
        const next = new Set(s.dirtyTabs);
        if (event.dirty) next.add(event.tabId);
        else next.delete(event.tabId);
        return { dirtyTabs: next };
      });
      break;
    }

    // ── Layout / pane ──
    case "layout-split": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state || state.panes.length >= 2) return s;

        const sourcePane = state.panes.find(
          (p) => p.id === state.focusedPaneId,
        );
        if (!sourcePane) return s;

        let newPaneTabs: Tab[] | undefined;
        let updatedSourcePane = sourcePane;

        if (event.tabId) {
          const tab = sourcePane.tabs.find((t) => t.id === event.tabId);
          if (tab) {
            newPaneTabs = [tab];
            const remaining = sourcePane.tabs.filter(
              (t) => t.id !== event.tabId,
            );
            const newTabs =
              remaining.length > 0 ? remaining : [makeTerminalTab()];
            const newActive =
              remaining.length > 0 && sourcePane.activeTabId !== event.tabId
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
        const next = new Map(s.projectPanes);
        next.set(projectId, {
          panes: [updatedSourcePane, newPane],
          focusedPaneId: newPane.id,
          splitDirection: event.direction,
        });
        return { projectPanes: next };
      });
      break;
    }

    case "layout-unsplit": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state || state.panes.length <= 1) return s;

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

        const next = new Map(s.projectPanes);
        next.set(projectId, {
          panes: [merged],
          focusedPaneId: merged.id,
          splitDirection: state.splitDirection,
        });
        return { projectPanes: next };
      });
      break;
    }

    case "layout-move-tab": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;

        const sourcePane = findPaneForTab(state, event.tabId);
        if (!sourcePane || sourcePane.id === event.targetPaneId) return s;

        const targetPane = state.panes.find((p) => p.id === event.targetPaneId);
        if (!targetPane) return s;

        const tab = sourcePane.tabs.find((t) => t.id === event.tabId)!;
        const remainingSource = sourcePane.tabs.filter(
          (t) => t.id !== event.tabId,
        );

        let newSourceActive = sourcePane.activeTabId;
        if (sourcePane.activeTabId === event.tabId) {
          newSourceActive = remainingSource[0]?.id ?? null;
        }

        const next = new Map(s.projectPanes);

        if (remainingSource.length === 0) {
          next.set(projectId, {
            ...state,
            panes: state.panes
              .filter((p) => p.id !== sourcePane.id)
              .map((p) =>
                p.id === event.targetPaneId
                  ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id }
                  : p,
              ),
            focusedPaneId: event.targetPaneId,
          });
        } else {
          let updated = updatePaneInState(state, sourcePane.id, () => ({
            ...sourcePane,
            tabs: remainingSource,
            activeTabId: newSourceActive,
          }));
          updated = updatePaneInState(updated, event.targetPaneId, (p) => ({
            ...p,
            tabs: [...p.tabs, tab],
            activeTabId: tab.id,
          }));
          next.set(projectId, updated);
        }
        return { projectPanes: next };
      });
      break;
    }

    case "layout-focus-pane": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state || state.focusedPaneId === event.paneId) return s;
        const next = new Map(s.projectPanes);
        next.set(projectId, { ...state, focusedPaneId: event.paneId });
        return { projectPanes: next };
      });
      break;
    }

    case "layout-focus-other-pane": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state || state.panes.length < 2) return s;
        const other = state.panes.find((p) => p.id !== state.focusedPaneId);
        if (!other) return s;
        const next = new Map(s.projectPanes);
        next.set(projectId, { ...state, focusedPaneId: other.id });
        return { projectPanes: next };
      });
      break;
    }

    case "layout-toggle-sidebar": {
      useLayoutStore.setState((s) => ({
        sidebarPanel: s.sidebarPanel === event.panel ? null : event.panel,
      }));
      break;
    }
  }
});
