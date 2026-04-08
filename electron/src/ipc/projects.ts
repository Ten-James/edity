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
      .filter((p): p is Project => p !== undefined);
    saveProjects(ordered);
  });

  // Edity Config (with auto-migration from legacy format)
  ipcMain.handle("read_edity_config", (_event, { projectPath }: { projectPath: string }) => {
    try {
      const filePath = path.join(projectPath, ".edity");
      const raw: Record<string, unknown> = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Auto-migrate legacy runCommand/runMode to runCommands[]
      if (raw.runCommand && !raw.runCommands) {
        raw.runCommands = [{
          name: raw.runCommand,
          command: raw.runCommand,
          mode: typeof raw.runMode === "string" ? raw.runMode : "terminal",
        }];
        delete raw.runCommand;
        delete raw.runMode;
        fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
      }

      const config: EdityConfig = {
        acronym: typeof raw.acronym === "string" ? raw.acronym : undefined,
        color: typeof raw.color === "string" ? raw.color : undefined,
        runCommands: Array.isArray(raw.runCommands) ? raw.runCommands : undefined,
      };
      return config;
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

  // Script Detection
  ipcMain.handle("detect_project_scripts", (_event, { projectPath }: { projectPath: string }) => {
    const scripts: Array<{ name: string; command: string; source: string }> = [];

    // package.json scripts
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.scripts) {
          for (const name of Object.keys(pkg.scripts)) {
            scripts.push({ name, command: `npm run ${name}`, source: "package.json" });
          }
        }
      } catch { /* ignore */ }
    }

    // Cargo.toml
    if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) {
      scripts.push({ name: "cargo build", command: "cargo build", source: "Cargo.toml" });
      scripts.push({ name: "cargo run", command: "cargo run", source: "Cargo.toml" });
      scripts.push({ name: "cargo test", command: "cargo test", source: "Cargo.toml" });
    }

    // go.mod
    if (fs.existsSync(path.join(projectPath, "go.mod"))) {
      scripts.push({ name: "go build", command: "go build ./...", source: "go.mod" });
      scripts.push({ name: "go run", command: "go run .", source: "go.mod" });
      scripts.push({ name: "go test", command: "go test ./...", source: "go.mod" });
    }

    // Makefile
    const makefilePath = path.join(projectPath, "Makefile");
    if (fs.existsSync(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, "utf-8");
        const targets = content.match(/^([a-zA-Z_][\w-]*):/gm);
        if (targets) {
          for (const t of targets.slice(0, 10)) {
            const name = t.replace(":", "");
            scripts.push({ name: `make ${name}`, command: `make ${name}`, source: "Makefile" });
          }
        }
      } catch { /* ignore */ }
    }

    // pyproject.toml
    if (fs.existsSync(path.join(projectPath, "pyproject.toml"))) {
      scripts.push({ name: "pytest", command: "python -m pytest", source: "pyproject.toml" });
    }

    return scripts;
  });

  // Background Process Runner (composite key: projectId:commandId)
  ipcMain.handle("run_project_command", (_event, { projectId, command, cwd, commandId }: { projectId: string; command: string; cwd: string; commandId?: string }) => {
    const key = `${projectId}:${commandId ?? "default"}`;
    const existing = runningProcesses.get(key);
    if (existing) {
      existing.kill();
      runningProcesses.delete(key);
    }

    const shell = process.env.SHELL || "/bin/sh";
    const proc = spawn(shell, ["-c", command], {
      cwd,
      stdio: "ignore",
      detached: false,
    });

    runningProcesses.set(key, proc);

    proc.on("exit", () => {
      runningProcesses.delete(key);
      sendToWindow(`project-run-exit-${key}`);
    });

    return { pid: proc.pid };
  });

  ipcMain.handle("kill_project_command", (_event, { projectId, commandId }: { projectId: string; commandId?: string }) => {
    if (commandId) {
      // Kill specific command
      const key = `${projectId}:${commandId}`;
      const proc = runningProcesses.get(key);
      if (proc) {
        proc.kill();
        runningProcesses.delete(key);
      }
    } else {
      // Kill all commands for this project
      for (const [key, proc] of runningProcesses) {
        if (key.startsWith(`${projectId}:`)) {
          proc.kill();
          runningProcesses.delete(key);
        }
      }
    }
  });

  // Dialog
  ipcMain.handle("show-open-dialog", async (_event, options: Electron.OpenDialogOptions) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, options);
  });
}
