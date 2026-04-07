import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import { useProjectStore } from "./projectStore";
import {
  findLeafByPaneId,
  findLeafByTabId,
  firstLeaf,
  getLeaves,
  makeLeaf,
  makePane,
  removeLeaf,
  splitLeafByZone,
  updatePane,
} from "@/lib/paneTree";
import type {
  Tab,
  TerminalTab,
  FileTab,
  BrowserTab,
  GitTab,
  ClaudeTab,
  DataTab,
  EventLogTab,
  RemoteAccessTab,
  AllTab,
  Pane,
  ProjectPaneState,
} from "@/types/tab";

// ─── Pure helpers ──────────────────────────────────────────────

let globalTabCounter = 0;

function makeTerminalTab(opts?: {
  initialCommand?: string;
  cwd?: string;
  worktreeBranch?: string;
}): TerminalTab {
  globalTabCounter += 1;
  return {
    id: crypto.randomUUID(),
    title: opts?.worktreeBranch
      ? `${opts.worktreeBranch} (worktree)`
      : `Terminal ${globalTabCounter}`,
    type: "terminal",
    initialCommand: opts?.initialCommand,
    cwd: opts?.cwd,
    worktreeBranch: opts?.worktreeBranch,
  };
}

function makeDefaultState(): ProjectPaneState {
  const pane = makePane();
  return {
    root: makeLeaf(pane),
    focusedPaneId: pane.id,
  };
}

function updatePaneInState(
  state: ProjectPaneState,
  paneId: string,
  updater: (pane: Pane) => Pane,
): ProjectPaneState {
  return { ...state, root: updatePane(state.root, paneId, updater) };
}

function removeTabFromState(
  state: ProjectPaneState,
  tabId: string,
): ProjectPaneState {
  const leaf = findLeafByTabId(state.root, tabId);
  if (!leaf) return state;
  const pane = leaf.pane;
  const remaining = pane.tabs.filter((t) => t.id !== tabId);

  if (remaining.length === 0) {
    // Pane goes empty: collapse it out of the tree if it has siblings,
    // otherwise leave the empty pane in place (single-leaf root case).
    const removed = removeLeaf(state.root, pane.id);
    if (removed === null) {
      // Last pane standing — keep the leaf, just clear its tabs.
      return updatePaneInState(state, pane.id, () => ({
        ...pane,
        tabs: [],
        activeTabId: null,
      }));
    }
    // Focused pane disappeared — refocus to any remaining leaf.
    const fallbackLeaf = firstLeaf(removed);
    return {
      ...state,
      root: removed,
      focusedPaneId:
        state.focusedPaneId === pane.id
          ? (fallbackLeaf?.pane.id ?? state.focusedPaneId)
          : state.focusedPaneId,
    };
  }

  // Pane survives with at least one tab: pick the next active.
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
    const leaf = findLeafByTabId(state.root, tabId);
    if (!leaf) continue;
    const tab = leaf.pane.tabs.find((t) => t.id === tabId);
    if (!tab) continue;
    const updated = updater(tab);
    if (!updated) return prev;
    const next = new Map(prev);
    next.set(
      projectId,
      updatePaneInState(state, leaf.pane.id, (p) => ({
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
  for (const leaf of getLeaves(state.root)) {
    const existing = leaf.pane.tabs.find(predicate);
    if (existing) {
      const next = new Map(prev);
      next.set(projectId, {
        ...updatePaneInState(state, leaf.pane.id, (p) => ({
          ...p,
          activeTabId: existing.id,
        })),
        focusedPaneId: leaf.pane.id,
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

/** Move a tab from its current leaf to the target leaf and return the
 *  full LayoutState with the updated map. Used by both layout-move-tab
 *  and the center-zone of layout-drop-tab. */
function moveTabBetweenLeaves(
  s: LayoutState,
  projectId: string,
  state: ProjectPaneState,
  event: { tabId: string; targetPaneId: string },
): Partial<LayoutState> {
  const sourceLeaf = findLeafByTabId(state.root, event.tabId);
  if (!sourceLeaf) return {};
  const sourcePane = sourceLeaf.pane;
  const tab = sourcePane.tabs.find((t) => t.id === event.tabId)!;
  const remainingSource = sourcePane.tabs.filter((t) => t.id !== event.tabId);
  const newSourceActive =
    sourcePane.activeTabId === event.tabId
      ? (remainingSource[0]?.id ?? null)
      : sourcePane.activeTabId;

  let nextRoot = updatePane(state.root, event.targetPaneId, (p) => ({
    ...p,
    tabs: [...p.tabs, tab],
    activeTabId: tab.id,
  }));

  if (remainingSource.length === 0) {
    const removed = removeLeaf(nextRoot, sourcePane.id);
    nextRoot = removed ?? nextRoot;
  } else {
    nextRoot = updatePane(nextRoot, sourcePane.id, (p) => ({
      ...p,
      tabs: remainingSource,
      activeTabId: newSourceActive,
    }));
  }

  const next = new Map(s.projectPanes);
  next.set(projectId, {
    ...state,
    root: nextRoot,
    focusedPaneId: event.targetPaneId,
  });
  return { projectPanes: next };
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
    for (const leaf of getLeaves(state.root)) {
      for (const tab of leaf.pane.tabs) {
        result.push({
          ...tab,
          projectId,
          projectPath: project.path,
          paneId: leaf.pane.id,
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
      const tab = makeTerminalTab({
        initialCommand: event.initialCommand,
        cwd: event.cwd,
        worktreeBranch: event.worktreeBranch,
      });
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
        const focusedLeaf = findLeafByPaneId(state.root, state.focusedPaneId);
        const targetPane =
          focusedLeaf?.pane ?? firstLeaf(state.root)?.pane;
        if (!targetPane) return s;

        // Check if file already open in any pane
        for (const leaf of getLeaves(state.root)) {
          const existing = leaf.pane.tabs.find(
            (t) => t.type === "file" && t.filePath === filePath,
          );
          if (existing) {
            const next = new Map(s.projectPanes);
            next.set(
              projectId,
              updatePaneInState(state, leaf.pane.id, (pn) => ({
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

    case "tab-create-remote-access": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => ({
        projectPanes: openOrCreateSingletonTab(
          s.projectPanes,
          projectId,
          (t) => t.type === "remote-access",
          (): RemoteAccessTab => ({
            id: crypto.randomUUID(),
            title: "Remote Access",
            type: "remote-access",
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
        const leaf = findLeafByTabId(state.root, event.tabId);
        if (!leaf) return s;
        const closingTab = leaf.pane.tabs.find((t) => t.id === event.tabId);
        if (closingTab?.type === "file") {
          invoke("unwatch_file", { tabId: event.tabId }).catch(() => {});
        }
        if (closingTab?.type === "remote-access") {
          invoke("remote_access_stop").catch(() => {});
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
        for (const leaf of getLeaves(state.root)) {
          for (const tab of leaf.pane.tabs) {
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
        const leaf = findLeafByTabId(state.root, event.tabId);
        if (!leaf || leaf.pane.activeTabId === event.tabId) return s;
        const next = new Map(s.projectPanes);
        next.set(
          projectId,
          updatePaneInState(state, leaf.pane.id, (p) => ({
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
        const focusedLeaf = findLeafByPaneId(state.root, state.focusedPaneId);
        const fallbackLeaf = firstLeaf(state.root);
        const pane = focusedLeaf?.pane ?? fallbackLeaf?.pane;
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
        if (!state) return s;

        const sourceLeaf = findLeafByPaneId(state.root, state.focusedPaneId);
        if (!sourceLeaf) return s;
        const sourcePane = sourceLeaf.pane;

        // If a specific tab was passed, move it into the new pane;
        // otherwise create an empty new pane next to the source.
        let newPaneTabs: Tab[] | undefined;
        let nextRoot = state.root;

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
            nextRoot = updatePane(nextRoot, sourcePane.id, (p) => ({
              ...p,
              tabs: newTabs,
              activeTabId: newActive,
            }));
          }
        }

        const newPane = makePane(newPaneTabs);
        // direction "horizontal" means a column-style layout (top/bottom);
        // map it to the equivalent split zone.
        const zone = event.direction === "horizontal" ? "right" : "bottom";
        nextRoot = splitLeafByZone(nextRoot, sourcePane.id, zone, newPane);

        const next = new Map(s.projectPanes);
        next.set(projectId, {
          ...state,
          root: nextRoot,
          focusedPaneId: newPane.id,
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
        if (!state || state.root.type === "leaf") return s;

        // Merge every pane's tabs into the focused pane (preserving its id)
        // and replace the entire layout root with that single leaf. Reusing
        // the focused pane id keeps PaneContainer mounted so terminals etc.
        // survive the unsplit.
        const focusedLeaf =
          findLeafByPaneId(state.root, state.focusedPaneId) ??
          firstLeaf(state.root)!;
        const focusedPane = focusedLeaf.pane;

        const mergedTabs: Tab[] = [...focusedPane.tabs];
        for (const leaf of getLeaves(state.root)) {
          if (leaf.pane.id !== focusedPane.id) {
            mergedTabs.push(...leaf.pane.tabs);
          }
        }

        const merged: Pane = {
          ...focusedPane,
          tabs: mergedTabs,
          activeTabId: focusedPane.activeTabId ?? mergedTabs[0]?.id ?? null,
        };

        const next = new Map(s.projectPanes);
        next.set(projectId, {
          root: makeLeaf(merged),
          focusedPaneId: merged.id,
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

        const sourceLeaf = findLeafByTabId(state.root, event.tabId);
        if (!sourceLeaf || sourceLeaf.pane.id === event.targetPaneId) return s;
        const targetLeaf = findLeafByPaneId(state.root, event.targetPaneId);
        if (!targetLeaf) return s;

        const sourcePane = sourceLeaf.pane;
        const tab = sourcePane.tabs.find((t) => t.id === event.tabId)!;
        const remainingSource = sourcePane.tabs.filter(
          (t) => t.id !== event.tabId,
        );

        let newSourceActive = sourcePane.activeTabId;
        if (sourcePane.activeTabId === event.tabId) {
          newSourceActive = remainingSource[0]?.id ?? null;
        }

        // First add the tab to the target pane.
        let nextRoot = updatePane(state.root, event.targetPaneId, (p) => ({
          ...p,
          tabs: [...p.tabs, tab],
          activeTabId: tab.id,
        }));

        if (remainingSource.length === 0) {
          // Source pane goes empty → collapse it out of the tree.
          const removed = removeLeaf(nextRoot, sourcePane.id);
          nextRoot = removed ?? nextRoot;
        } else {
          nextRoot = updatePane(nextRoot, sourcePane.id, (p) => ({
            ...p,
            tabs: remainingSource,
            activeTabId: newSourceActive,
          }));
        }

        const next = new Map(s.projectPanes);
        next.set(projectId, {
          ...state,
          root: nextRoot,
          focusedPaneId: event.targetPaneId,
        });
        return { projectPanes: next };
      });
      break;
    }

    case "layout-drop-tab": {
      const projectId = getActiveProjectId();
      if (!projectId) break;
      useLayoutStore.setState((s) => {
        const state = s.projectPanes.get(projectId);
        if (!state) return s;

        const sourceLeaf = findLeafByTabId(state.root, event.tabId);
        const targetLeaf = findLeafByPaneId(state.root, event.targetPaneId);
        if (!sourceLeaf || !targetLeaf) return s;

        // Center drop: identical to layout-move-tab but inline so we don't
        // dispatch from inside a reducer. No-op when dropping on the same
        // pane (the user just released the drag, no movement intended).
        if (event.zone === "center") {
          if (sourceLeaf.pane.id === targetLeaf.pane.id) return s;
          return moveTabBetweenLeaves(s, projectId, state, event);
        }

        // Edge drop: split the target pane and place the dragged tab in the
        // newly created sub-pane. Source pane gets the tab removed.
        const sourcePane = sourceLeaf.pane;
        const tab = sourcePane.tabs.find((t) => t.id === event.tabId)!;
        const remainingSource = sourcePane.tabs.filter(
          (t) => t.id !== event.tabId,
        );
        const newSourceActive =
          sourcePane.activeTabId === event.tabId
            ? (remainingSource[0]?.id ?? null)
            : sourcePane.activeTabId;

        const newPane = makePane([tab]);
        let nextRoot = state.root;

        // Remove (or empty) the source pane first so the split lands on a
        // tree that no longer references the moved tab.
        if (sourcePane.id !== event.targetPaneId) {
          if (remainingSource.length === 0) {
            const removed = removeLeaf(nextRoot, sourcePane.id);
            nextRoot = removed ?? nextRoot;
          } else {
            nextRoot = updatePane(nextRoot, sourcePane.id, (p) => ({
              ...p,
              tabs: remainingSource,
              activeTabId: newSourceActive,
            }));
          }
        } else {
          // Dropping on the same pane (edge): leave the original tab in
          // place inside the source — the dragged tab is duplicated into
          // the new sub-pane. Restore by also removing it from the source
          // since we want a true "move".
          if (remainingSource.length === 0) {
            // Edge-split a pane that only contained the dragged tab is a
            // no-op; nothing to split into.
            return s;
          }
          nextRoot = updatePane(nextRoot, sourcePane.id, (p) => ({
            ...p,
            tabs: remainingSource,
            activeTabId: newSourceActive,
          }));
        }

        nextRoot = splitLeafByZone(
          nextRoot,
          event.targetPaneId,
          event.zone,
          newPane,
        );

        const next = new Map(s.projectPanes);
        next.set(projectId, {
          ...state,
          root: nextRoot,
          focusedPaneId: newPane.id,
        });
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
        if (!state) return s;
        const leaves = [...getLeaves(state.root)];
        if (leaves.length < 2) return s;
        const currentIdx = leaves.findIndex(
          (l) => l.pane.id === state.focusedPaneId,
        );
        const nextLeaf = leaves[(currentIdx + 1) % leaves.length];
        const next = new Map(s.projectPanes);
        next.set(projectId, { ...state, focusedPaneId: nextLeaf.pane.id });
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
