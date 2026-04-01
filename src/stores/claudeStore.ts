import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke, listen } from "@/lib/ipc";
import { useLayoutStore } from "./layoutStore";

type ClaudeStatus = "working" | "idle" | "notification" | "active" | null;

interface ClaudeState {
  projectStatuses: Map<string, ClaudeStatus>;
  _pollIntervalId: ReturnType<typeof setInterval> | null;
  _notificationCleanup: (() => void) | null;

  startPolling: () => void;
  stopPolling: () => void;
}

export const useClaudeStore = create<ClaudeState>((set, get) => ({
  projectStatuses: new Map(),
  _pollIntervalId: null,
  _notificationCleanup: null,

  startPolling: () => {
    get().stopPolling();

    const poll = async () => {
      try {
        const statuses = await invoke<Record<string, { status: string }>>(
          "get_all_claude_statuses",
          {},
        );
        const projectPanes = useLayoutStore.getState().projectPanes;

        const tabToProject = new Map<string, string>();
        for (const [projectId, state] of projectPanes) {
          for (const pane of state.panes) {
            for (const tab of pane.tabs) {
              tabToProject.set(tab.id, projectId);
            }
          }
        }

        const perProject = new Map<string, ClaudeStatus>();
        for (const [tabId, { status }] of Object.entries(statuses)) {
          const projectId = tabToProject.get(tabId);
          if (!projectId) continue;
          const current = perProject.get(projectId);
          if (status === "notification") {
            perProject.set(projectId, "notification");
          } else if (status === "working" && current !== "notification") {
            perProject.set(projectId, "working");
          } else if (!current) {
            perProject.set(projectId, (status as ClaudeStatus) || "idle");
          }
        }

        set({ projectStatuses: perProject });
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, 2_000);

    // Listen for notification sound
    listen("claude-notification", () => {
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
      } catch { /* ignore */ }
    }).then((cleanup) => {
      set({ _notificationCleanup: cleanup });
    });

    set({ _pollIntervalId: id });
  },

  stopPolling: () => {
    const { _pollIntervalId, _notificationCleanup } = get();
    if (_pollIntervalId) clearInterval(_pollIntervalId);
    _notificationCleanup?.();
    set({ _pollIntervalId: null, _notificationCleanup: null });
  },
}));

// Also play sound on explicit event dispatch
subscribe((event) => {
  if (event.type === "claude-notification") {
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
    } catch { /* ignore */ }
  }
});
