const { app, BrowserWindow, ipcMain, dialog, systemPreferences, protocol, net } = require("electron");
const { spawn, spawnSync, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const pty = require("node-pty");

// --- Custom Protocol ---

protocol.registerSchemesAsPrivileged([{
  scheme: "edity-file",
  privileges: { secure: true, supportFetchAPI: true, stream: true },
}]);

// --- Git Helper ---

function execGit(args, cwd, timeout = 15000) {
  try {
    const result = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, output: result.trimEnd() };
  } catch (err) {
    return { ok: false, error: err.stderr?.trim() || err.message };
  }
}

function parseGitStatus(output) {
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const rest = line.slice(3);
    const parts = rest.split(" -> ");
    return {
      path: parts.length > 1 ? parts[1] : parts[0],
      indexStatus,
      workTreeStatus,
      originalPath: parts.length > 1 ? parts[0] : undefined,
    };
  });
}

// --- State ---

/** @type {Map<string, import('node-pty').IPty>} */
const ptyInstances = new Map();

/** @type {Map<string, fs.FSWatcher>} */
const fileWatchers = new Map();

/** @type {fs.FSWatcher | null} */
let projectDirWatcher = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let projectDirDebounce = null;

/** @type {Map<string, import('child_process').ChildProcess>} */
const runningProcesses = new Map();

/** @type {Map<string, { isClaudeCode: boolean, oscTitle: string|null, status: string|null, claudePid: number|null, oscBuffer: string, pidLookupAt: number }>} */
const tabClaudeState = new Map();

/** @type {BrowserWindow | null} */
let mainWindow = null;

// --- Config ---

const CONFIG_DIR = path.join(os.homedir(), ".config", "edity");
const PROJECTS_PATH = path.join(CONFIG_DIR, "projects.json");
const CLAUDE_STATUS_DIR = path.join(CONFIG_DIR, "claude-status");

// --- Project Management ---

function loadProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(projects, null, 2));
}

// --- File Viewer ---

const MAX_TEXT_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const IMAGE_MIMES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

function detectMime(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return IMAGE_MIMES[ext] || null;
}

// --- Claude Code Detection ---

const HOOK_SCRIPT_PATH = path.join(CONFIG_DIR, "claude-hook.sh");
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDE_SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");
const EDITY_HOOK_MARKER = "claude-hook.sh";

function isEdityHookEntry(entry) {
  return entry.hooks && entry.hooks.some(
    (h) => h.command && h.command.includes(EDITY_HOOK_MARKER),
  );
}

function installHookScript() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const src = path.join(__dirname, "claude-hook.sh");
  fs.copyFileSync(src, HOOK_SCRIPT_PATH);
  fs.chmodSync(HOOK_SCRIPT_PATH, 0o755);
}

function ensureClaudeHooks() {
  try {
    installHookScript();
    fs.mkdirSync(CLAUDE_STATUS_DIR, { recursive: true });

    // Ensure ~/.claude directory exists
    const claudeDir = path.join(os.homedir(), ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });

    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
    } catch {}

    if (!settings.hooks) settings.hooks = {};

    const edityHooks = {
      UserPromptSubmit: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} working` }],
      },
      Stop: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} idle` }],
      },
      Notification: {
        matcher: "",
        hooks: [{ type: "command", command: `${HOOK_SCRIPT_PATH} notification` }],
      },
    };

    // Remove old edity hooks and add fresh ones
    const before = JSON.stringify(settings.hooks);
    for (const [event, hookEntry] of Object.entries(edityHooks)) {
      if (!settings.hooks[event]) settings.hooks[event] = [];
      settings.hooks[event] = settings.hooks[event].filter(
        (entry) => !isEdityHookEntry(entry),
      );
      settings.hooks[event].push(hookEntry);
    }

    if (JSON.stringify(settings.hooks) !== before) {
      fs.writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settings, null, 2),
      );
    }
  } catch (err) {
    console.error("Failed to inject Claude hooks:", err.message);
  }
}

function findClaudePid(shellPid) {
  try {
    let currentPid = shellPid;
    for (let depth = 0; depth < 10; depth++) {
      const result = spawnSync("pgrep", ["-n", "-P", String(currentPid)], {
        encoding: "utf-8",
        timeout: 2000,
      });
      const child = result.stdout?.trim();
      if (!child) break;
      currentPid = parseInt(child, 10);
      if (isNaN(currentPid)) break;

      const psResult = spawnSync("ps", ["-o", "comm=", "-p", String(currentPid)], {
        encoding: "utf-8",
        timeout: 2000,
      });
      const name = psResult.stdout?.trim();
      if (name && name.includes("claude")) return currentPid;
    }
  } catch {}
  return null;
}

function readClaudeSession(claudePid) {
  const sessionPath = path.join(CLAUDE_SESSIONS_DIR, `${claudePid}.json`);
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch {}
  return null;
}

function readHookStatus(sessionId) {
  if (!sessionId) return null;
  const statusPath = path.join(CLAUDE_STATUS_DIR, `${sessionId}.json`);
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch {}
  return null;
}

// --- Window Creation ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "../icon.png"),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 8, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// --- IPC Handlers ---

// Terminal
ipcMain.handle("spawn_shell", (_event, { tabId, cwd, initialCommand }) => {
  const shell = process.env.SHELL || "/bin/sh";
  const ptyProcess = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env: process.env,
  });

  // Initialize Claude state tracking for this tab
  tabClaudeState.set(tabId, {
    isClaudeCode: false,
    oscTitle: null,
    status: null,
    claudePid: null,
    oscBuffer: "",
    pidLookupAt: 0,
  });

  let commandSent = !initialCommand;
  ptyProcess.onData((data) => {
    // Parse OSC title sequences to detect Claude Code
    const state = tabClaudeState.get(tabId);
    if (state) {
      // Check for notification OSC sequences (9, 99, 777)
      if (/\x1b\](9|99|777);/.test(data) && state.isClaudeCode) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("claude-notification", { tabId });
        }
      }

      // Buffer for split OSC sequences
      const combined = state.oscBuffer + data;
      const oscRe = /\x1b\]([02]);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
      const matches = [...combined.matchAll(oscRe)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        state.oscTitle = last[2];
        // Only set isClaudeCode to true via OSC; never reset it here.
        // The process name check in get_claude_status handles detection/reset.
        if (last[2].includes("Claude Code")) {
          state.isClaudeCode = true;
        }
        // Keep any trailing incomplete OSC sequence
        const lastMatchEnd = last.index + last[0].length;
        const trailing = combined.slice(lastMatchEnd);
        state.oscBuffer = trailing.includes("\x1b]") ? trailing.slice(trailing.lastIndexOf("\x1b]")) : "";
      } else {
        // Keep partial OSC if present, otherwise clear buffer
        const escIdx = combined.lastIndexOf("\x1b]");
        state.oscBuffer = escIdx >= 0 ? combined.slice(escIdx) : "";
      }
      // Prevent buffer from growing unbounded
      if (state.oscBuffer.length > 1024) state.oscBuffer = "";
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty-output-${tabId}`, data);
    }
    if (!commandSent) {
      commandSent = true;
      setTimeout(() => ptyProcess.write(initialCommand + "\n"), 100);
    }
  });

  ptyInstances.set(tabId, ptyProcess);
});

ipcMain.handle("write_to_pty", (_event, { tabId, data }) => {
  const proc = ptyInstances.get(tabId);
  if (proc) proc.write(data);
});

ipcMain.handle("resize_pty", (_event, { tabId, cols, rows }) => {
  const proc = ptyInstances.get(tabId);
  if (proc) proc.resize(cols, rows);
});

ipcMain.handle("close_pty", (_event, { tabId }) => {
  const proc = ptyInstances.get(tabId);
  if (proc) {
    proc.kill();
    ptyInstances.delete(tabId);
  }
  tabClaudeState.delete(tabId);
});

ipcMain.handle("get_foreground_process", (_event, { tabId }) => {
  const proc = ptyInstances.get(tabId);
  if (!proc) return null;
  const name = proc.process;
  if (!name) return null;
  // Strip path prefix, keep just the process name
  return name.split("/").pop() || name;
});

ipcMain.handle("get_claude_status", (_event, { tabId }) => {
  const state = tabClaudeState.get(tabId);
  if (!state || !state.isClaudeCode) return null;

  const proc = ptyInstances.get(tabId);
  if (!proc) return null;

  // If we have a cached PID, verify Claude is still alive
  if (state.claudePid) {
    try {
      process.kill(state.claudePid, 0); // signal 0 = check existence
    } catch {
      // Claude process is gone — reset detection
      state.isClaudeCode = false;
      state.claudePid = null;
      state.status = null;
      return null;
    }
  }

  // Find Claude PID if we don't have it yet (with 10s cooldown to avoid blocking)
  if (!state.claudePid) {
    const now = Date.now();
    if (now - state.pidLookupAt > 10000) {
      state.pidLookupAt = now;
      state.claudePid = findClaudePid(proc.pid);
    }
  }

  let session = null;
  if (state.claudePid) {
    session = readClaudeSession(state.claudePid);
  }

  // Read hook-written status file
  const hookStatus = readHookStatus(session?.sessionId);

  return {
    isClaudeCode: true,
    oscTitle: state.oscTitle,
    status: hookStatus?.status || "active",
    sessionId: session?.sessionId || null,
    cwd: session?.cwd || null,
    startedAt: session?.startedAt || null,
  };
});

ipcMain.handle("get_all_claude_statuses", () => {
  /** @type {Record<string, { status: string }>} */
  const result = {};
  for (const [tabId, state] of tabClaudeState) {
    if (!state.isClaudeCode) continue;
    const proc = ptyInstances.get(tabId);
    if (!proc) continue;

    // Verify PID is still alive
    if (state.claudePid) {
      try {
        process.kill(state.claudePid, 0);
      } catch {
        state.isClaudeCode = false;
        state.claudePid = null;
        state.status = null;
        continue;
      }
    }

    let session = null;
    if (state.claudePid) {
      session = readClaudeSession(state.claudePid);
    }
    const hookStatus = readHookStatus(session?.sessionId);
    result[tabId] = { status: hookStatus?.status || "active" };
  }
  return result;
});

// System
ipcMain.handle("get_homedir", () => os.homedir());

// Projects
ipcMain.handle("get_projects", () => loadProjects());

ipcMain.handle("add_project", (_event, { name, path: projectPath }) => {
  const projects = loadProjects();
  const project = { id: String(Date.now()), name, path: projectPath };
  projects.push(project);
  saveProjects(projects);
  return project;
});

ipcMain.handle("remove_project", (_event, { id }) => {
  const projects = loadProjects();
  saveProjects(projects.filter((p) => p.id !== id));
});

// File Tree

function getGitIgnoredSet(dirPath, filePaths) {
  if (filePaths.length === 0) return new Set();
  try {
    const result = spawnSync("git", ["check-ignore", "--stdin"], {
      input: filePaths.join("\n"),
      encoding: "utf-8",
      cwd: dirPath,
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      return new Set(result.stdout.split("\n").filter(Boolean));
    }
  } catch {
    // git not available or not a repo
  }
  return new Set();
}

ipcMain.handle("list_directory", (_event, { path: dirPath, showIgnored }) => {
  try {
    const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries = dirents
      .filter((d) => d.name !== ".git")
      .map((d) => ({
        name: d.name,
        path: path.join(dirPath, d.name),
        is_dir: d.isDirectory(),
      }));

    let filtered = entries;
    if (!showIgnored) {
      const fullPaths = entries.map((e) => e.path);
      const ignored = getGitIgnoredSet(dirPath, fullPaths);
      filtered = entries.filter((e) => !ignored.has(e.path));
    }

    filtered.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return filtered;
  } catch {
    return [];
  }
});

// File Viewer
ipcMain.handle("read_file_content", (_event, { path: filePath }) => {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;

    const mime = detectMime(filePath);
    if (mime) {
      if (size > MAX_IMAGE_SIZE) return { type: "TooLarge", size };
      const url = `edity-file://${encodeURI(filePath)}`;
      return { type: "Image", url, mime, size };
    }

    if (size > MAX_TEXT_SIZE) return { type: "TooLarge", size };

    const bytes = fs.readFileSync(filePath);
    // Check if valid UTF-8 text
    const text = bytes.toString("utf-8");
    // Check for null bytes (binary indicator)
    if (text.includes("\0")) return { type: "Binary", size };
    return { type: "Text", content: text, size };
  } catch (err) {
    throw new Error(String(err));
  }
});

ipcMain.handle("get_project_types", (_event, { projectPath }) => {
  const result = { compilerOptions: null, libs: [] };

  // Read tsconfig.json or jsconfig.json
  for (const configName of ["tsconfig.json", "jsconfig.json"]) {
    const configPath = path.join(projectPath, configName);
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        result.compilerOptions = parsed.compilerOptions ?? null;
      } catch {}
      break;
    }
  }

  // Read package.json dependencies
  const pkgPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgPath)) return result;

  let deps = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
  } catch {
    return result;
  }

  const MAX_DTS_SIZE = 500 * 1024;
  const nodeModules = path.join(projectPath, "node_modules");

  for (const dep of deps) {
    let dtsPath = null;

    // Check package.json "types" or "typings" field
    const depPkgPath = path.join(nodeModules, dep, "package.json");
    if (fs.existsSync(depPkgPath)) {
      try {
        const depPkg = JSON.parse(fs.readFileSync(depPkgPath, "utf-8"));
        const typesField = depPkg.types || depPkg.typings;
        if (typesField) {
          const candidate = path.join(nodeModules, dep, typesField);
          if (fs.existsSync(candidate)) dtsPath = candidate;
        }
      } catch {}
    }

    // Fallback: index.d.ts in package
    if (!dtsPath) {
      const candidate = path.join(nodeModules, dep, "index.d.ts");
      if (fs.existsSync(candidate)) dtsPath = candidate;
    }

    // Fallback: @types package
    if (!dtsPath) {
      const atTypesDir = path.join(nodeModules, "@types", dep);
      const atTypesPkg = path.join(atTypesDir, "package.json");
      if (fs.existsSync(atTypesPkg)) {
        try {
          const atPkg = JSON.parse(fs.readFileSync(atTypesPkg, "utf-8"));
          const typesField = atPkg.types || atPkg.typings || "index.d.ts";
          const candidate = path.join(atTypesDir, typesField);
          if (fs.existsSync(candidate)) dtsPath = candidate;
        } catch {}
      } else {
        const candidate = path.join(atTypesDir, "index.d.ts");
        if (fs.existsSync(candidate)) dtsPath = candidate;
      }
    }

    if (dtsPath) {
      try {
        const stat = fs.statSync(dtsPath);
        if (stat.size <= MAX_DTS_SIZE) {
          const content = fs.readFileSync(dtsPath, "utf-8");
          const monacoPath = `file:///node_modules/${dep}/${path.basename(dtsPath)}`;
          result.libs.push({ content, filePath: monacoPath });
        }
      } catch {}
    }
  }

  return result;
});

ipcMain.handle("write_file", (_event, { path: filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// File Operations
ipcMain.handle("delete_path", (_event, { targetPath }) => {
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("rename_path", (_event, { oldPath, newPath }) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("create_file", (_event, { filePath }) => {
  try {
    fs.writeFileSync(filePath, "", "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("create_directory", (_event, { dirPath }) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// File Watching
ipcMain.handle("watch_file", (_event, { tabId, path: filePath }) => {
  // Remove existing watcher for this tab
  const existing = fileWatchers.get(tabId);
  if (existing) existing.close();

  try {
    const watcher = fs.watch(filePath, () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`file-changed-${tabId}`);
      }
    });
    fileWatchers.set(tabId, watcher);
  } catch {
    // File may not exist
  }
});

ipcMain.handle("unwatch_file", (_event, { tabId }) => {
  const watcher = fileWatchers.get(tabId);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(tabId);
  }
});

// Project Directory Watching
ipcMain.handle("watch_project_dir", (_event, { projectPath }) => {
  // Close existing watcher
  if (projectDirWatcher) {
    projectDirWatcher.close();
    projectDirWatcher = null;
  }
  if (projectDirDebounce) {
    clearTimeout(projectDirDebounce);
    projectDirDebounce = null;
  }

  try {
    projectDirWatcher = fs.watch(projectPath, { recursive: true }, (_eventType, filename) => {
      // Skip .git and node_modules changes
      if (filename && (
        filename.startsWith(".git/") || filename.startsWith(".git\\") || filename === ".git" ||
        filename.startsWith("node_modules/") || filename.startsWith("node_modules\\")
      )) {
        return;
      }
      if (projectDirDebounce) clearTimeout(projectDirDebounce);
      projectDirDebounce = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("directory-changed");
        }
      }, 500);
    });
    projectDirWatcher.on("error", () => {
      // Watcher may fail if directory is removed
    });
  } catch {
    // Directory may not exist
  }
});

ipcMain.handle("unwatch_project_dir", () => {
  if (projectDirWatcher) {
    projectDirWatcher.close();
    projectDirWatcher = null;
  }
  if (projectDirDebounce) {
    clearTimeout(projectDirDebounce);
    projectDirDebounce = null;
  }
});

// --- Git ---

ipcMain.handle("git_status", (_event, { cwd }) => {
  const result = execGit(["status", "--porcelain=v1", "-uall"], cwd);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, files: parseGitStatus(result.output) };
});

ipcMain.handle("git_diff_stats", (_event, { cwd }) => {
  let additions = 0;
  let deletions = 0;

  for (const args of [["diff", "--numstat"], ["diff", "--cached", "--numstat"]]) {
    const result = execGit(args, cwd);
    if (result.ok && result.output) {
      for (const line of result.output.split("\n")) {
        const parts = line.split("\t");
        if (parts.length >= 2 && parts[0] !== "-") {
          additions += parseInt(parts[0]) || 0;
          deletions += parseInt(parts[1]) || 0;
        }
      }
    }
  }

  const statusResult = execGit(["status", "--porcelain=v1", "-uall"], cwd);
  const changedFiles = statusResult.ok && statusResult.output
    ? statusResult.output.split("\n").filter(Boolean).length
    : 0;

  return { ok: true, additions, deletions, changedFiles };
});

ipcMain.handle("git_branch_info", (_event, { cwd }) => {
  const branchResult = execGit(["branch", "--show-current"], cwd);
  if (!branchResult.ok) {
    return { ok: false, error: branchResult.error };
  }

  const current = branchResult.output || "HEAD";
  const detached = !branchResult.output;
  let upstream = null;
  let ahead = 0;
  let behind = 0;

  const upstreamResult = execGit(
    ["rev-parse", "--abbrev-ref", "@{upstream}"],
    cwd,
  );
  if (upstreamResult.ok) {
    upstream = upstreamResult.output;
    const countResult = execGit(
      ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      cwd,
    );
    if (countResult.ok) {
      const parts = countResult.output.split("\t");
      ahead = parseInt(parts[0]) || 0;
      behind = parseInt(parts[1]) || 0;
    }
  }

  return { ok: true, current, upstream, ahead, behind, detached };
});

ipcMain.handle("git_branches", (_event, { cwd }) => {
  const result = execGit(
    [
      "branch",
      "-a",
      "--format=%(refname:short)\t%(objectname:short)\t%(HEAD)",
    ],
    cwd,
  );
  if (!result.ok) return { ok: false, error: result.error };

  const branches = result.output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, shortHash, head] = line.split("\t");
      return {
        name,
        shortHash,
        isCurrent: head === "*",
        isRemote: name.startsWith("origin/"),
      };
    });
  return { ok: true, branches };
});

ipcMain.handle("git_log", (_event, { cwd, count = 50, skip = 0 }) => {
  const result = execGit(
    [
      "log",
      "--all",
      `--format=%H\t%h\t%an\t%ae\t%at\t%s\t%D\t%P`,
      `-n`,
      String(count),
      `--skip=${skip}`,
    ],
    cwd,
  );
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.output) return { ok: true, entries: [] };

  const entries = result.output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, authorEmail, timestamp, subject, refs, parents] =
        line.split("\t");
      return {
        hash,
        shortHash,
        author,
        authorEmail,
        timestamp: parseInt(timestamp),
        subject,
        refs: refs || "",
        parentHashes: parents ? parents.split(" ").filter(Boolean) : [],
      };
    });
  return { ok: true, entries };
});

ipcMain.handle("git_show_commit", (_event, { cwd, hash }) => {
  // Get commit metadata
  const metaResult = execGit(
    ["show", "--format=%H\t%h\t%an\t%ae\t%at\t%s\t%b", "--no-patch", hash],
    cwd,
  );
  if (!metaResult.ok) return { ok: false, error: metaResult.error };

  const metaLine = metaResult.output.split("\n")[0];
  const [h, shortHash, author, authorEmail, timestamp, subject, ...bodyParts] =
    metaLine.split("\t");

  // Get file list
  const statResult = execGit(
    ["diff-tree", "--no-commit-id", "-r", "--name-status", hash],
    cwd,
  );
  const files = (statResult.ok && statResult.output)
    ? statResult.output.split("\n").filter(Boolean).map((line) => {
        const [status, ...pathParts] = line.split("\t");
        return { status, path: pathParts.join("\t") };
      })
    : [];

  // Get full diff
  const diffResult = execGit(["show", "--format=", "--patch", hash], cwd, 30000);
  const diff = diffResult.ok ? diffResult.output : "";

  return {
    ok: true,
    hash: h,
    shortHash,
    author,
    authorEmail,
    timestamp: parseInt(timestamp),
    subject,
    body: bodyParts.join("\t").trim(),
    files,
    diff,
  };
});

ipcMain.handle("git_file_diff", (_event, { cwd, filePath, staged }) => {
  const args = ["diff"];
  if (staged) args.push("--cached");
  args.push("--", filePath);
  const result = execGit(args, cwd);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, diff: result.output };
});

ipcMain.handle("git_stage", (_event, { cwd, paths }) => {
  const result = execGit(["add", "--", ...paths], cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_unstage", (_event, { cwd, paths }) => {
  const result = execGit(["reset", "HEAD", "--", ...paths], cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_discard", (_event, { cwd, paths }) => {
  const result = execGit(["checkout", "--", ...paths], cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_commit", (_event, { cwd, message }) => {
  const result = execGit(["commit", "-m", message], cwd);
  if (!result.ok) return { ok: false, error: result.error };
  // Extract hash from output
  const hashMatch = result.output.match(/\[[\w/]+ ([a-f0-9]+)\]/);
  return { ok: true, hash: hashMatch ? hashMatch[1] : undefined };
});

ipcMain.handle("git_push", (_event, { cwd, setUpstream }) => {
  const args = ["push"];
  if (setUpstream) {
    const branchResult = execGit(["branch", "--show-current"], cwd);
    if (branchResult.ok && branchResult.output) {
      args.push("--set-upstream", "origin", branchResult.output);
    }
  }
  const result = execGit(args, cwd, 30000);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_pull", (_event, { cwd }) => {
  const result = execGit(["pull"], cwd, 30000);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_fetch", (_event, { cwd }) => {
  const result = execGit(["fetch", "--all"], cwd, 30000);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_switch_branch", (_event, { cwd, branch }) => {
  const result = execGit(["switch", branch], cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_create_branch", (_event, { cwd, branch, checkout }) => {
  const args = checkout ? ["switch", "-c", branch] : ["branch", branch];
  const result = execGit(args, cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

ipcMain.handle("git_delete_branch", (_event, { cwd, branch, force }) => {
  const result = execGit(["branch", force ? "-D" : "-d", branch], cwd);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
});

// Edity Config
ipcMain.handle("read_edity_config", (_event, { projectPath }) => {
  try {
    const filePath = path.join(projectPath, ".edity");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
});

ipcMain.handle("write_edity_config", (_event, { projectPath, config }) => {
  try {
    const filePath = path.join(projectPath, ".edity");
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return config;
  } catch (err) {
    throw new Error(`Failed to write .edity config: ${err}`);
  }
});

// Background Process Runner
ipcMain.handle(
  "run_project_command",
  (_event, { projectId, command, cwd }) => {
    // Kill existing process for this project if any
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`project-run-exit-${projectId}`);
      }
    });

    return { pid: proc.pid };
  },
);

ipcMain.handle("kill_project_command", (_event, { projectId }) => {
  const proc = runningProcesses.get(projectId);
  if (proc) {
    proc.kill();
    runningProcesses.delete(projectId);
  }
});

// Dialog
ipcMain.handle("show-open-dialog", async (_event, options) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, options);
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    systemPreferences.askForMediaAccess("microphone");
  }

  // Serve image files via custom protocol (replaces base64 IPC)
  protocol.handle("edity-file", (request) => {
    let filePath;
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
  // Clean up all PTY instances
  for (const proc of ptyInstances.values()) {
    proc.kill();
  }
  ptyInstances.clear();

  // Clean up file watchers
  for (const watcher of fileWatchers.values()) {
    watcher.close();
  }
  fileWatchers.clear();

  // Clean up project directory watcher
  if (projectDirWatcher) {
    projectDirWatcher.close();
    projectDirWatcher = null;
  }
  if (projectDirDebounce) {
    clearTimeout(projectDirDebounce);
    projectDirDebounce = null;
  }

  // Clean up background processes
  for (const proc of runningProcesses.values()) {
    proc.kill();
  }
  runningProcesses.clear();

  // Clean up Claude state
  tabClaudeState.clear();

  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
