import { ipcMain, app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { CONFIG_DIR } from "../lib/state";
import { getLogBuffer } from "../lib/logger";

const BUGS_DIR = path.join(CONFIG_DIR, "bugs");

export function registerBugReportHandlers(): void {
  ipcMain.handle(
    "create_bug_report",
    (_event, { dom, consoleLog }: { dom: string; consoleLog: string }) => {
      try {
        fs.mkdirSync(BUGS_DIR, { recursive: true });

        const mainLog = getLogBuffer();
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, "-");
        const fileName = `bug-report-${timestamp}.md`;
        const filePath = path.join(BUGS_DIR, fileName);

        const report = [
          "# Edity Bug Report",
          `- **Timestamp**: ${now.toISOString()}`,
          `- **App Version**: ${app.getVersion()}`,
          `- **Electron**: ${process.versions.electron}`,
          `- **Platform**: ${process.platform} ${process.arch}`,
          `- **Node**: ${process.versions.node}`,
          "",
          "## Main Process Log",
          "",
          "```",
          mainLog || "(empty)",
          "```",
          "",
          "## Renderer Console Log",
          "",
          "```",
          consoleLog || "(empty)",
          "```",
          "",
          "## DOM Snapshot",
          "",
          "```html",
          dom || "(empty)",
          "```",
          "",
        ].join("\n");

        fs.writeFileSync(filePath, report, "utf-8");

        return { ok: true as const, filePath };
      } catch (err) {
        return { ok: false as const, error: String(err) };
      }
    },
  );
}
