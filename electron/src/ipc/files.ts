import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { detectMime, MAX_TEXT_SIZE, MAX_IMAGE_SIZE } from "../lib/file-helpers";
import {
  fileWatchers,
  sendToWindow,
  projectDirWatcher,
  projectDirDebounce,
  setProjectDirWatcher,
  setProjectDirDebounce,
} from "../lib/state";

function getGitIgnoredSet(dirPath: string, filePaths: string[]): Set<string> {
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
    // git not available
  }
  return new Set();
}

export function registerFileHandlers(): void {
  // Recursive file search — used by the tree filter to know which folders
  // contain matches so we can hide ones that don't. Uses `git ls-files`
  // because it's drastically faster than walking the FS ourselves and it
  // already respects gitignore + tracks untracked files in one shot.
  // Returns absolute paths to keep parity with `list_directory`.
  ipcMain.handle(
    "search_files",
    (
      _event,
      {
        rootPath,
        query,
        showIgnored,
      }: { rootPath: string; query: string; showIgnored?: boolean },
    ) => {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) {
        return { matchedFiles: [] as string[], matchedDirs: [] as string[] };
      }

      const args = ["ls-files", "--cached", "--others"];
      if (!showIgnored) args.push("--exclude-standard");

      let stdout: string;
      try {
        const result = spawnSync("git", args, {
          cwd: rootPath,
          encoding: "utf-8",
          maxBuffer: 64 * 1024 * 1024,
          timeout: 10000,
        });
        if (result.status !== 0) {
          return { matchedFiles: [] as string[], matchedDirs: [] as string[] };
        }
        stdout = result.stdout;
      } catch {
        return { matchedFiles: [] as string[], matchedDirs: [] as string[] };
      }

      const matchedFiles = new Set<string>();
      const matchedDirs = new Set<string>();

      for (const relPath of stdout.split("\n")) {
        if (!relPath) continue;
        const segments = relPath.split("/");

        // A path matches if any of its segments (file name OR an ancestor
        // dir name) contains the query. This way searching for "comp" also
        // surfaces files inside `src/components/`, not just files literally
        // named "comp*".
        const matched = segments.some((seg) =>
          seg.toLowerCase().includes(trimmed),
        );
        if (!matched) continue;

        const fullPath = path.join(rootPath, relPath);
        matchedFiles.add(fullPath);

        // Walk up and mark every ancestor dir as containing a match so the
        // tree can keep them visible. Stop at the project root.
        let cursor = path.dirname(fullPath);
        while (cursor.length > rootPath.length && cursor.startsWith(rootPath)) {
          matchedDirs.add(cursor);
          cursor = path.dirname(cursor);
        }
      }

      return {
        matchedFiles: [...matchedFiles],
        matchedDirs: [...matchedDirs],
      };
    },
  );

  // File Tree
  ipcMain.handle("list_directory", (_event, { path: dirPath, showIgnored }: { path: string; showIgnored?: boolean }) => {
    try {
      const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
      const entries = dirents
        .filter((d) => d.name !== ".git")
        .map((d) => ({ name: d.name, path: path.join(dirPath, d.name), is_dir: d.isDirectory() }));

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
  ipcMain.handle("read_file_content", (_event, { path: filePath }: { path: string }) => {
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
      const text = bytes.toString("utf-8");
      if (text.includes("\0")) return { type: "Binary", size };
      return { type: "Text", content: text, size };
    } catch (err) {
      throw new Error(String(err));
    }
  });

  ipcMain.handle("get_project_types", (_event, { projectPath }: { projectPath: string }) => {
    const result: { compilerOptions: unknown; libs: Array<{ content: string; filePath: string }> } = {
      compilerOptions: null,
      libs: [],
    };

    for (const configName of ["tsconfig.json", "jsconfig.json"]) {
      const configPath = path.join(projectPath, configName);
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          const parsed = JSON.parse(raw);
          result.compilerOptions = parsed.compilerOptions ?? null;
        } catch { /* ignore */ }
        break;
      }
    }

    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) return result;

    let deps: string[] = [];
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
      let dtsPath: string | null = null;

      const depPkgPath = path.join(nodeModules, dep, "package.json");
      if (fs.existsSync(depPkgPath)) {
        try {
          const depPkg = JSON.parse(fs.readFileSync(depPkgPath, "utf-8"));
          const typesField = depPkg.types || depPkg.typings;
          if (typesField) {
            const candidate = path.join(nodeModules, dep, typesField);
            if (fs.existsSync(candidate)) dtsPath = candidate;
          }
        } catch { /* ignore */ }
      }

      if (!dtsPath) {
        const candidate = path.join(nodeModules, dep, "index.d.ts");
        if (fs.existsSync(candidate)) dtsPath = candidate;
      }

      if (!dtsPath) {
        const atTypesDir = path.join(nodeModules, "@types", dep);
        const atTypesPkg = path.join(atTypesDir, "package.json");
        if (fs.existsSync(atTypesPkg)) {
          try {
            const atPkg = JSON.parse(fs.readFileSync(atTypesPkg, "utf-8"));
            const typesField = atPkg.types || atPkg.typings || "index.d.ts";
            const candidate = path.join(atTypesDir, typesField);
            if (fs.existsSync(candidate)) dtsPath = candidate;
          } catch { /* ignore */ }
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
        } catch { /* ignore */ }
      }
    }

    return result;
  });

  ipcMain.handle("write_file", (_event, { path: filePath, content }: { path: string; content: string }) => {
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // File Operations
  ipcMain.handle("delete_path", (_event, { targetPath }: { targetPath: string }) => {
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

  ipcMain.handle("rename_path", (_event, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("create_file", (_event, { filePath }: { filePath: string }) => {
    try {
      fs.writeFileSync(filePath, "", "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("create_directory", (_event, { dirPath }: { dirPath: string }) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // File Watching
  ipcMain.handle("watch_file", (_event, { tabId, path: filePath }: { tabId: string; path: string }) => {
    const existing = fileWatchers.get(tabId);
    if (existing) existing.close();

    try {
      const watcher = fs.watch(filePath, () => {
        sendToWindow(`file-changed-${tabId}`);
      });
      fileWatchers.set(tabId, watcher);
    } catch {
      // File may not exist
    }
  });

  ipcMain.handle("unwatch_file", (_event, { tabId }: { tabId: string }) => {
    const watcher = fileWatchers.get(tabId);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(tabId);
    }
  });

  // Project Directory Watching
  ipcMain.handle("watch_project_dir", (_event, { projectPath }: { projectPath: string }) => {
    if (projectDirWatcher) {
      projectDirWatcher.close();
      setProjectDirWatcher(null);
    }
    if (projectDirDebounce) {
      clearTimeout(projectDirDebounce);
      setProjectDirDebounce(null);
    }

    try {
      const watcher = fs.watch(projectPath, { recursive: true }, (_eventType, filename) => {
        if (filename && (
          filename.startsWith(".git/") || filename.startsWith(".git\\") || filename === ".git" ||
          filename.startsWith("node_modules/") || filename.startsWith("node_modules\\")
        )) {
          return;
        }
        if (projectDirDebounce) clearTimeout(projectDirDebounce);
        setProjectDirDebounce(setTimeout(() => {
          sendToWindow("directory-changed");
        }, 500));
      });
      watcher.on("error", () => {});
      setProjectDirWatcher(watcher);
    } catch {
      // Directory may not exist
    }
  });

  ipcMain.handle("unwatch_project_dir", () => {
    if (projectDirWatcher) {
      projectDirWatcher.close();
      setProjectDirWatcher(null);
    }
    if (projectDirDebounce) {
      clearTimeout(projectDirDebounce);
      setProjectDirDebounce(null);
    }
  });
}
