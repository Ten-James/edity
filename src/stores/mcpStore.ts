import { create } from "zustand";
import { invoke, listen } from "@/lib/ipc";
import { dispatch, subscribe } from "./eventBus";
import type { EdityEvent } from "./events";

export interface EventLogEntry {
  id: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

const MAX_EVENTS = 500;

interface McpStore {
  running: boolean;
  port: number | null;
  events: EventLogEntry[];
  start: (port?: number) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  refreshStatus: () => Promise<void>;
}

export const useMcpStore = create<McpStore>((set) => ({
  running: false,
  port: null,
  events: [],

  start: async (port?: number) => {
    const result = await invoke<
      { ok: true; port: number } | { ok: false; error: string }
    >("mcp_start", { port });
    if (result.ok) {
      set({ running: true, port: result.port });
    } else {
      throw new Error(result.error);
    }
  },

  stop: async () => {
    await invoke("mcp_stop");
    set({ running: false, port: null });
  },

  clear: () => set({ events: [] }),

  refreshStatus: async () => {
    const status = await invoke<{ running: boolean }>("mcp_status");
    set({ running: status.running });
  },
}));

function pushEntry(type: string, payload: Record<string, unknown>): void {
  const entry: EventLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    payload,
  };
  const events = [...useMcpStore.getState().events, entry];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  useMcpStore.setState({ events });
}

// Capture all event bus events
subscribe((event: EdityEvent) => {
  const { type, ...rest } = event;
  pushEntry(type, rest);
});

// Listen for dispatched UI events from MCP tools
listen<Record<string, unknown>>("mcp-dispatch", ({ payload }) => {
  if (typeof payload.type === "string") {
    dispatch(payload as unknown as EdityEvent);
  }
});
