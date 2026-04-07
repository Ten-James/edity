import { create } from "zustand";

/**
 * Tracks whether a tab is currently being dragged anywhere in the app.
 * PaneDropZones uses this to render its drop targets only during a drag,
 * otherwise the absolute-positioned overlay would intercept normal clicks
 * on pane content.
 */
interface DragState {
  draggingTabId: string | null;
}

export const useDragStore = create<DragState>(() => ({
  draggingTabId: null,
}));

export function setDraggingTabId(tabId: string | null) {
  useDragStore.setState({ draggingTabId: tabId });
}
