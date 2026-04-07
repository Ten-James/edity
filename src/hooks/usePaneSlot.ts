import { useSyncExternalStore } from "react";
import { getPaneSlot, subscribePaneSlots } from "@/lib/paneSlots";

export function usePaneSlot(paneId: string): HTMLDivElement | undefined {
  return useSyncExternalStore(
    subscribePaneSlots,
    () => getPaneSlot(paneId),
    () => undefined,
  );
}
