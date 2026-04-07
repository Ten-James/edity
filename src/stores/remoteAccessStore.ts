import { create } from "zustand";
import { invoke, listen } from "@/lib/ipc";

interface RemoteAccessState {
  running: boolean;
  serverUrl: string | null;
  qrDataUrl: string | null;
  connectedClients: number;
  starting: boolean;
}

interface RemoteAccessActions {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const useRemoteAccessStore = create<RemoteAccessState & RemoteAccessActions>((set) => ({
  running: false,
  serverUrl: null,
  qrDataUrl: null,
  connectedClients: 0,
  starting: false,

  start: async () => {
    set({ starting: true });
    const result = await invoke<
      { ok: true; qrDataUrl: string; serverUrl: string } | { ok: false; error: string }
    >("remote_access_start");
    if (result.ok) {
      set({ running: true, serverUrl: result.serverUrl, qrDataUrl: result.qrDataUrl, starting: false });
    } else {
      set({ starting: false });
      throw new Error(result.error);
    }
  },

  stop: async () => {
    await invoke("remote_access_stop");
    set({ running: false, serverUrl: null, qrDataUrl: null, connectedClients: 0 });
  },

  refreshStatus: async () => {
    const status = await invoke<{ running: boolean; serverUrl: string | null; connectedClients: number }>(
      "remote_access_status",
    );
    set({ running: status.running, serverUrl: status.serverUrl, connectedClients: status.connectedClients });
  },
}));

// Listen for client count changes from main process
listen<{ count: number }>("remote-access-clients-changed", ({ payload }) => {
  useRemoteAccessStore.setState({ connectedClients: payload.count });
});
