import { useLayoutEffect, useRef } from "react";
import { dispatch } from "@/stores/eventBus";
import { useDragStore } from "@/stores/dragStore";
import { registerPaneSlot } from "@/lib/paneSlots";
import { TabBar } from "./TabBar";
import { PaneDropZones } from "./PaneDropZones";

interface PaneContainerProps {
  paneId: string;
  isFocused: boolean;
  showTabBar: boolean;
}

export function PaneContainer({
  paneId,
  isFocused,
  showTabBar,
}: PaneContainerProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  // Drop zones are mounted only while a tab is actively being dragged.
  // Otherwise the absolute-positioned overlay would intercept clicks on
  // pane content.
  const isDragging = useDragStore((s) => s.draggingTabId !== null);

  // Expose this pane's content slot to TabHost. useLayoutEffect with a
  // paneId dependency — not a callback ref — so this only runs when the
  // pane actually mounts, unmounts, or changes its id. A callback ref
  // (even wrapped in useCallback) can be re-attached by React on routine
  // re-renders, and since registerPaneSlot re-parents host divs whenever
  // a slot is attached, a spurious detach/attach cycle would yank the
  // xterm textarea out of the document mid-frame and blur its focus —
  // that's why clicking on an unfocused pane used to kill input.
  //
  // registerPaneSlot synchronously re-parents every host div that belongs
  // to this pane (read from layoutStore) when the slot is registered, so
  // we don't need to worry about TabHost effect timing anymore.
  useLayoutEffect(() => {
    registerPaneSlot(paneId, slotRef.current);
    return () => registerPaneSlot(paneId, null);
  }, [paneId]);

  return (
    <div
      className="flex flex-1 h-full flex-col overflow-hidden"
      onPointerDown={() => {
        if (!isFocused) dispatch({ type: "layout-focus-pane", paneId });
      }}
    >
      {showTabBar && <TabBar paneId={paneId} />}
      <div ref={slotRef} className="flex-1 relative">
        {isDragging && <PaneDropZones paneId={paneId} />}
      </div>
    </div>
  );
}
