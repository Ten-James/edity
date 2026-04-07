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

  // Expose this pane's content slot to TabHost so it can portal tab views
  // into it without ever unmounting them when the user splits, unsplits, or
  // moves a tab between panes. useLayoutEffect (not useEffect) so the slot
  // is registered before the next paint and tab content appears in the same
  // frame as the pane itself.
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
