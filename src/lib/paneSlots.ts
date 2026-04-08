// Registry that lets PaneContainer expose its content slot DOM element so the
// TabHost can portal tab views into it. Tab content lives in a single stable
// React tree (TabHost) and is physically moved between panes by re-parenting
// each tab's host div via appendChild — no React unmount, so terminals,
// editor state, scroll position, etc. survive split / unsplit / move-tab.
//
// Slot registration is driven by a callback ref in PaneContainer, which fires
// during React's mutation phase. When a new slot is registered we SYNCHRONOUSLY
// re-parent every host div whose tab currently belongs to this pane — reading
// the current layout straight from layoutStore. This eliminates the window
// where TabHostEntry's layout effect would otherwise run with a stale slot
// snapshot and leave the host div orphaned in a detached DOM subtree (which
// broke terminal input + focus after drag-drop edge splits).

import { useLayoutStore } from "@/stores/layoutStore";
import { getLeaves } from "@/lib/paneTree";

const slots = new Map<string, HTMLDivElement>();
const listeners = new Set<() => void>();

// Per-tab "host divs" — stable DOM nodes that the TabHost portals each tab's
// React subtree into. Stored in a module-level map (not React state) so we
// can mutate them imperatively without tripping React Compiler immutability
// rules, and so the same node persists for a tab id across re-renders.
const tabHostDivs = new Map<string, HTMLDivElement>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function registerPaneSlot(
  paneId: string,
  el: HTMLDivElement | null,
): void {
  if (el) {
    if (slots.get(paneId) === el) return;
    slots.set(paneId, el);
    // Re-parent any host div whose tab currently lives in this pane. We
    // look up the layout store directly — at ref-callback time (mutation
    // phase) the store already reflects the new tree, and this is the only
    // authoritative source of "which tabs belong to which pane".
    const projectPanes = useLayoutStore.getState().projectPanes;
    for (const state of projectPanes.values()) {
      for (const leaf of getLeaves(state.root)) {
        if (leaf.pane.id !== paneId) continue;
        for (const tab of leaf.pane.tabs) {
          const div = tabHostDivs.get(tab.id);
          if (div && div.parentElement !== el) {
            el.appendChild(div);
          }
        }
      }
    }
  } else {
    if (!slots.has(paneId)) return;
    slots.delete(paneId);
  }
  notify();
}

export function getPaneSlot(paneId: string): HTMLDivElement | undefined {
  return slots.get(paneId);
}

export function subscribePaneSlots(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOrCreateTabHostDiv(tabId: string): HTMLDivElement {
  let div = tabHostDivs.get(tabId);
  if (!div) {
    div = document.createElement("div");
    div.className = "absolute inset-0";
    tabHostDivs.set(tabId, div);
  }
  return div;
}

export function moveTabHostDivToSlot(
  tabId: string,
  slot: HTMLDivElement,
): void {
  const div = tabHostDivs.get(tabId);
  if (div && div.parentElement !== slot) {
    slot.appendChild(div);
  }
}

export function setTabHostDivActive(tabId: string, active: boolean): void {
  const div = tabHostDivs.get(tabId);
  if (div) {
    div.style.display = active ? "block" : "none";
  }
}

export function disposeTabHostDiv(tabId: string): void {
  const div = tabHostDivs.get(tabId);
  if (div) {
    div.remove();
    tabHostDivs.delete(tabId);
  }
}
