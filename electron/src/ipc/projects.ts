import { ipcMain, dialog } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import {
  CONFIG_DIR,
  PROJECTS_PATH,
  mainWindow,
  runningProcesses,
  sendToWindow,
} from "../lib/state";
import type { Project, EdityConfig } from "../../../shared/types/project";

function loadProjects(): Project[] {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(projects, null, 2));
}

export function registerProjectHandlers(): void {
  ipcMain.handle("get_homedir", () => os.homedir());

  ipcMain.handle("get_projects", () => loadProjects());

  ipcMain.handle("add_project", (_event, { name, path: projectPath }: { name: string; path: string }) => {
    const projects = loadProjects();
    const project: Project = { id: String(Date.now()), name, path: projectPath };
    projects.push(project);
    saveProjects(projects);
    return project;
  });

  ipcMain.handle("remove_project", (_event, { id }: { id: string }) => {
    const projects = loadProjects();
    saveProjects(projects.filter((p) => p.id !== id));
  });

  ipcMain.handle("reorder_projects", (_event, { ids }: { ids: string[] }) => {
    const projects = loadProjects();
    const ordered = ids
      .map((id) => projects.find((p) => p.id === id))
      .filter(Boolean) as Project[];
    saveProjects(ordered);
  });

  // Edity Config
  ipcMain.handle("read_edity_config", (_event, { projectPath }: { projectPath: string }) => {
    try {
      const filePath = path.join(projectPath, ".edity");
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as EdityConfig;
    } catch {
      return null;
    }
  });

  ipcMain.handle("write_edity_config", (_event, { projectPath, config }: { projectPath: string; config: EdityConfig }) => {
    try {
      const filePath = path.join(projectPath, ".edity");
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
      return config;
    } catch (err) {
      throw new Error(`Failed to write .edity config: ${err}`);
    }
  });

  // Background Process Runner
  ipcMain.handle("run_project_command", (_event, { projectId, command, cwd }: { projectId: string; command: string; cwd: string }) => {
    const existing = runningProcesses.get(projectId);
    if (existing) {
      existing.kill();
      runningProcesses.delete(projectId);
    }

    const shell = process.env.SHELL || "/bin/sh";
    const proc = spawn(shell, ["-c", command], {
      cwd,
      stdio: "ignore",
      detached: false,
    });

    runningProcesses.set(projectId, proc);

    proc.on("exit", () => {
      runningProcesses.delete(projectId);
      sendToWindow(`project-run-exit-${projectId}`);
    });

    return { pid: proc.pid };
  });

  ipcMain.handle("kill_project_command", (_event, { projectId }: { projectId: string }) => {
    const proc = runningProcesses.get(projectId);
    if (proc) {
      proc.kill();
      runningProcesses.delete(projectId);
    }
  });

  // Dialog
  ipcMain.handle("show-open-dialog", async (_event, options: Electron.OpenDialogOptions) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, options);
  });
}
