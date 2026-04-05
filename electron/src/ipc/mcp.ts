import { ipcMain } from "electron";
import {
  startEventLogServer,
  stopEventLogServer,
  isRunning,
} from "../mcp/event-log-server";

export function registerMcpHandlers(): void {
  ipcMain.handle(
    "mcp_start",
    async (_event, { port }: { port?: number }) => {
      try {
        const result = await startEventLogServer(port);
        return { ok: true as const, port: result.port };
      } catch (err) {
        return { ok: false as const, error: String(err) };
      }
    },
  );

  ipcMain.handle("mcp_stop", async () => {
    try {
      await stopEventLogServer();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  });

  ipcMain.handle("mcp_status", () => ({
    running: isRunning(),
  }));
}
