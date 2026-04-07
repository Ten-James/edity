import { ipcMain } from "electron";
import {
  startRemoteAccessServer,
  stopRemoteAccessServer,
  getRemoteAccessStatus,
} from "../remote-access/server";

export function registerRemoteAccessHandlers(): void {
  ipcMain.handle("remote_access_start", async () => {
    try {
      const result = await startRemoteAccessServer();
      return { ok: true as const, ...result };
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  });

  ipcMain.handle("remote_access_stop", async () => {
    try {
      await stopRemoteAccessServer();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  });

  ipcMain.handle("remote_access_status", () => {
    return getRemoteAccessStatus();
  });
}
