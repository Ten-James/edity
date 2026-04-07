import { useState } from "react";
import { dispatch } from "@/stores/eventBus";
import { cn } from "@/lib/utils";
import type { DropZone } from "@/types/tab";

interface PaneDropZonesProps {
  paneId: string;
}

const TAB_DRAG_MIME = "application/x-edity-tab-id";

/**
 * Overlay rendered on top of a pane while a tab is being dragged. Shows
 * five drop targets — the four edges split the pane and the center moves
 * the dragged tab into it. Only one zone is highlighted at a time, picked
 * by which corner of the pane the cursor is closest to.
 *
 * Pointer-events are turned off when no drag is in progress so this layer
 * never intercepts normal clicks on the pane content.
 */
export function PaneDropZones({ paneId }: PaneDropZonesProps) {
  const [active, setActive] = useState<DropZone | null>(null);

  function pickZone(e: React.DragEvent<HTMLDivElement>): DropZone {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Center cross — within the inner 40% rectangle the user is targeting
    // the body of the pane, not its edges, so we treat it as a "merge" drop.
    const cx = Math.abs(x - 0.5);
    const cy = Math.abs(y - 0.5);
    if (cx < 0.2 && cy < 0.2) return "center";

    // Outside the center area: pick the edge that's furthest from center
    // along its axis. This gives a clean diagonal split: corners are
    // assigned to whichever edge dominates.
    if (cx > cy) return x < 0.5 ? "left" : "right";
    return y < 0.5 ? "top" : "bottom";
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const zone = pickZone(e);
    if (zone !== active) setActive(zone);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // dragleave fires when crossing into a child element. Only clear when
    // the pointer actually leaves the overlay's bounding box.
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      setActive(null);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    const tabId = e.dataTransfer.getData(TAB_DRAG_MIME);
    if (!tabId) return;
    e.preventDefault();
    const zone = pickZone(e);
    setActive(null);
    dispatch({
      type: "layout-drop-tab",
      tabId,
      targetPaneId: paneId,
      zone,
    });
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="pointer-events-auto absolute inset-0 z-30"
    >
      {/* Indicator overlay — only visible while a zone is active. */}
      {active && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bg-primary/25 border-2 border-primary transition-all",
            active === "center" && "inset-0",
            active === "left" && "left-0 top-0 bottom-0 w-1/2",
            active === "right" && "right-0 top-0 bottom-0 w-1/2",
            active === "top" && "left-0 right-0 top-0 h-1/2",
            active === "bottom" && "left-0 right-0 bottom-0 h-1/2",
          )}
        />
      )}
    </div>
  );
}

export { TAB_DRAG_MIME };
