import { create } from "zustand";
import { subscribe } from "./eventBus";
import { listen } from "@/lib/ipc";
import { useLayoutStore } from "./layoutStore";
import { flattenPanes } from "@/lib/paneTree";

export type ClaudeStatus =
  | "working"
  | "idle"
  | "notification"
  | "active"
  | null;

interface StatusChangedPayload {
  tabId: string;
  sessionId: string;
  status: string;
}

function projectStatusesEqual(
  a: Map<string, ClaudeStatus>,
  b: Map<string, ClaudeStatus>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/**
 * Aggregate per-tab statuses into per-project statuses with the priority
 * notification > working > anything else > idle > null. Identical to the
 * previous polling-based implementation; just runs on every inbound event
 * instead of every 2 seconds.
 */
function aggregate(
  tabStatuses: Map<string, ClaudeStatus>,
): Map<string, ClaudeStatus> {
  const projectPanes = useLayoutStore.getState().projectPanes;
  const tabToProject = new Map<string, string>();
  for (const [projectId, state] of projectPanes) {
    for (const pane of flattenPanes(state.root)) {
      for (const tab of pane.tabs) {
        tabToProject.set(tab.id, projectId);
      }
    }
  }

  const perProject = new Map<string, ClaudeStatus>();
  for (const [tabId, status] of tabStatuses) {
    const projectId = tabToProject.get(tabId);
    if (!projectId || !status) continue;
    const current = perProject.get(projectId);
    if (status === "notification") {
      perProject.set(projectId, "notification");
    } else if (status === "working" && current !== "notification") {
      perProject.set(projectId, "working");
    } else if (!current) {
      perProject.set(projectId, status);
    }
  }
  return perProject;
}

function playNotificationSound(): void {
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
  } catch {
    /* ignore */
  }
}

interface ClaudeState {
  projectStatuses: Map<string, ClaudeStatus>;
  /**
   * Per-tab Claude status, updated via push from the main process.
   * Consumed by the terminal hook to tint the background of the tab that
   * actually runs Claude (see src/lib/claude-colors.ts).
   */
  tabStatuses: Map<string, ClaudeStatus>;
  _statusCleanup: (() => void) | null;
  _notificationCleanup: (() => void) | null;

  startSubscription: () => void;
  stopSubscription: () => void;
}

export const useClaudeStore = create<ClaudeState>((set, get) => ({
  projectStatuses: new Map(),
  tabStatuses: new Map(),
  _statusCleanup: null,
  _notificationCleanup: null,

  /**
   * Subscribe to push updates from the main process. Called once on app
   * startup; replaces the former 2-second polling loop. Status updates
   * arrive via the claude-status-changed IPC channel that the HTTP server
   * in electron/src/ipc/claude-ipc-server.ts publishes whenever the hook
   * script POSTs a new status.
   */
  startSubscription: () => {
    get().stopSubscription();

    listen<StatusChangedPayload>("claude-status-changed", ({ payload }) => {
      const tabStatuses = new Map(get().tabStatuses);
      tabStatuses.set(payload.tabId, payload.status as ClaudeStatus);
      const perProject = aggregate(tabStatuses);
      const changed = !projectStatusesEqual(get().projectStatuses, perProject);
      set({
        tabStatuses,
        ...(changed ? { projectStatuses: perProject } : {}),
      });
    }).then((cleanup) => {
      set({ _statusCleanup: cleanup });
    });

    listen("claude-notification", () => {
      playNotificationSound();
    }).then((cleanup) => {
      set({ _notificationCleanup: cleanup });
    });
  },

  stopSubscription: () => {
    const { _statusCleanup, _notificationCleanup } = get();
    _statusCleanup?.();
    _notificationCleanup?.();
    set({ _statusCleanup: null, _notificationCleanup: null });
  },
}));

// Also play sound on explicit event dispatch (e.g. MCP tool forwards it)
subscribe((event) => {
  if (event.type === "claude-notification") {
    playNotificationSound();
  }
});
