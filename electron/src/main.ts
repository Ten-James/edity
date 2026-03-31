import { app, BrowserWindow, protocol, net, systemPreferences } from "electron";
import * as path from "path";
import {
  PROJECT_ROOT,
  mainWindow,
  setMainWindow,
  ptyInstances,
  fileWatchers,
  runningProcesses,
  tabClaudeState,
  projectDirWatcher,
  projectDirDebounce,
  setProjectDirWatcher,
  setProjectDirDebounce,
} from "./lib/state";
import { detectMime } from "./lib/file-helpers";
import { registerTerminalHandlers } from "./ipc/terminal";
import { registerGitHandlers } from "./ipc/git";
import { registerFileHandlers } from "./ipc/files";
import { registerProjectHandlers } from "./ipc/projects";
import { ensureClaudeHooks, registerClaudeDetectionHandlers } from "./ipc/claude-detection";
import { registerClaudeSdkHandlers, cleanupAllSessions } from "./ipc/claude-sdk";

// --- Custom Protocol ---

protocol.registerSchemesAsPrivileged([{
  scheme: "edity-file",
  privileges: { secure: true, supportFetchAPI: true, stream: true },
}]);

// --- Window Creation ---

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(PROJECT_ROOT, "icon.png"),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 8, y: 13 },
    webPreferences: {
      preload: path.join(PROJECT_ROOT, "electron/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  setMainWindow(win);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(PROJECT_ROOT, "dist/index.html"));
  }
}

// --- Register all IPC handlers ---

registerTerminalHandlers();
registerGitHandlers();
registerFileHandlers();
registerProjectHandlers();
registerClaudeDetectionHandlers();
registerClaudeSdkHandlers(() => mainWindow);

// --- App Lifecycle ---

app.whenReady().then(async () => {
  // Fix PATH for packaged macOS apps (Finder doesn't inherit shell PATH)
  try {
    const { default: fixPath } = await import("fix-path");
    fixPath();
  } catch {
    // fix-path is best-effort
  }

  if (process.platform === "darwin") {
    systemPreferences.askForMediaAccess("microphone");
  }

  protocol.handle("edity-file", (request) => {
    let filePath: string;
    try {
      const url = new URL(request.url);
      filePath = decodeURIComponent(url.pathname);
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    const mime = detectMime(filePath);
    if (!mime) return new Response("Forbidden", { status: 403 });
    if (!path.isAbsolute(filePath)) return new Response("Forbidden", { status: 403 });

    return net.fetch(`file://${filePath}`);
  });

  ensureClaudeHooks();
  createWindow();
});

app.on("window-all-closed", () => {
  for (const proc of ptyInstances.values()) proc.kill();
  ptyInstances.clear();

  for (const watcher of fileWatchers.values()) watcher.close();
  fileWatchers.clear();

  if (projectDirWatcher) {
    projectDirWatcher.close();
    setProjectDirWatcher(null);
  }
  if (projectDirDebounce) {
    clearTimeout(projectDirDebounce);
    setProjectDirDebounce(null);
  }

  for (const proc of runningProcesses.values()) proc.kill();
  runningProcesses.clear();

  tabClaudeState.clear();
  cleanupAllSessions();

  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
