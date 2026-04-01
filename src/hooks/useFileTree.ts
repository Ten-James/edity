import { useEffect, useState } from "react";
import { invoke, listen } from "@/lib/ipc";
import { dispatch } from "@/stores/eventBus";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "sonner";
import type { GitFileStatus } from "@/types/git";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileTreeContextMenu {
  entry: FileEntry;
  x: number;
  y: number;
}

export type GitFilter = "all" | "M" | "A" | "D" | "?";

export function hasGitStatusInTree(
  entry: FileEntry,
  gitStatusMap: Map<string, string>,
  projectPath: string,
  filter: GitFilter,
): boolean {
  const rel = entry.path.replace(projectPath + "/", "");
  if (!entry.is_dir) {
    return (gitStatusMap.get(rel) ?? null) === filter;
  }
  for (const [path, status] of gitStatusMap) {
    if (path.startsWith(rel + "/") && status === filter) return true;
  }
  return false;
}

export function useFileTree() {
  const activeProject = useProjectStore((s) => s.activeProject);

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, string>>(new Map());
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [gitFilter, setGitFilter] = useState<GitFilter>("all");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenu | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{
    parentDir: string;
    type: "file" | "directory";
    name: string;
  } | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);

  function refreshTree() {
    if (!activeProject) return;
    invoke<FileEntry[]>("list_directory", {
      path: activeProject.path,
      showIgnored,
    }).then(setEntries);
    invoke<{ ok: boolean; files?: GitFileStatus[] }>("git_status", {
      cwd: activeProject.path,
    }).then((result) => {
      if (result.ok && result.files) {
        const map = new Map<string, string>();
        for (const file of result.files) {
          const status =
            file.indexStatus !== " " && file.indexStatus !== "?"
              ? file.indexStatus
              : file.workTreeStatus !== " "
                ? file.workTreeStatus
                : file.indexStatus;
          map.set(file.path, status);
        }
        setGitStatusMap(map);
      }
    });
  }

  // Watch project directory
  useEffect(() => {
    refreshTree();

    if (!activeProject) {
      setEntries([]);
      setGitStatusMap(new Map());
      return;
    }

    let unlisten: (() => void) | null = null;
    invoke("watch_project_dir", { projectPath: activeProject.path }).catch(() => {});

    listen("directory-changed", () => {
      refreshTree();
      setRefreshSignal((s) => s + 1);
    }).then((fn) => { unlisten = fn; });

    return () => {
      if (unlisten) unlisten();
      invoke("unwatch_project_dir").catch(() => {});
    };
  }, [activeProject, showIgnored]);

  // Selection
  function handleSelect(path: string, event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      setSelectedPaths(new Set([path]));
    }
  }

  function handleContextMenuOpen(menu: FileTreeContextMenu) {
    if (!selectedPaths.has(menu.entry.path)) {
      setSelectedPaths(new Set([menu.entry.path]));
    }
    setContextMenu(menu);
  }

  // File operations
  async function handleDelete() {
    setContextMenu(null);
    const paths = [...selectedPaths];
    if (paths.length === 0) return;

    let successCount = 0;
    for (const targetPath of paths) {
      const result = await invoke<{ ok: boolean; error?: string }>("delete_path", { targetPath });
      if (result.ok) {
        dispatch({ type: "tab-close-by-filepath", filePath: targetPath });
        successCount++;
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    }
    setSelectedPaths(new Set());
    if (successCount > 0) {
      toast.success(successCount === 1 ? "Deleted" : `Deleted ${successCount} items`);
    }
  }

  function handleRenameStart() {
    if (!contextMenu) return;
    setRenaming({ path: contextMenu.entry.path, name: contextMenu.entry.name });
    setContextMenu(null);
  }

  async function handleRenameSubmit() {
    if (!renaming) return;
    const dir = renaming.path.substring(0, renaming.path.lastIndexOf("/"));
    const newPath = `${dir}/${renaming.name}`;
    if (newPath === renaming.path) {
      setRenaming(null);
      return;
    }
    const result = await invoke<{ ok: boolean; error?: string }>("rename_path", {
      oldPath: renaming.path,
      newPath,
    });
    if (result.ok) {
      dispatch({ type: "tab-close-by-filepath", filePath: renaming.path });
      toast.success("Renamed");
    } else {
      toast.error(`Failed to rename: ${result.error}`);
    }
    setRenaming(null);
  }

  function handleNewEntry(type: "file" | "directory") {
    if (!contextMenu) return;
    const parentDir = contextMenu.entry.is_dir
      ? contextMenu.entry.path
      : contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf("/"));
    setCreating({ parentDir, type, name: "" });
    setContextMenu(null);
  }

  async function handleCreateSubmit() {
    if (!creating || !creating.name.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = `${creating.parentDir}/${creating.name.trim()}`;
    const handler = creating.type === "file" ? "create_file" : "create_directory";
    const args = creating.type === "file" ? { filePath: fullPath } : { dirPath: fullPath };
    const result = await invoke<{ ok: boolean; error?: string }>(handler, args);
    if (result.ok) {
      toast.success(creating.type === "file" ? "File created" : "Folder created");
      if (creating.type === "file") {
        dispatch({ type: "tab-open-file", filePath: fullPath });
      }
    } else {
      toast.error(`Failed to create: ${result.error}`);
    }
    setCreating(null);
  }

  function handleCopyPath() {
    if (!contextMenu) return;
    navigator.clipboard.writeText(contextMenu.entry.path);
    toast.success("Path copied");
    setContextMenu(null);
  }

  function handleOpenFile() {
    if (!contextMenu) return;
    if (!contextMenu.entry.is_dir) {
      dispatch({ type: "tab-open-file", filePath: contextMenu.entry.path });
    }
    setContextMenu(null);
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      setSelectedPaths(new Set());
    }
  }

  function handleBackgroundContextMenu(e: React.MouseEvent) {
    if (e.target !== e.currentTarget || !activeProject) return;
    e.preventDefault();
    setContextMenu({
      entry: { name: activeProject.name, path: activeProject.path, is_dir: true },
      x: e.clientX,
      y: e.clientY,
    });
  }

  // Filtering
  let filtered = filter
    ? entries.filter((e) => {
        const lf = filter.toLowerCase();
        if (e.name.toLowerCase().includes(lf)) return true;
        if (!e.is_dir || !activeProject) return false;
        const rel = e.path.replace(activeProject.path + "/", "");
        for (const [filePath] of gitStatusMap) {
          if (filePath.startsWith(rel + "/") && filePath.toLowerCase().includes(lf)) return true;
        }
        return true;
      })
    : entries;

  if (gitFilter !== "all" && activeProject) {
    filtered = filtered.filter((e) =>
      hasGitStatusInTree(e, gitStatusMap, activeProject.path, gitFilter),
    );
  }

  const gitCounts = { M: 0, A: 0, D: 0, "?": 0 };
  for (const status of gitStatusMap.values()) {
    if (status in gitCounts) gitCounts[status as keyof typeof gitCounts]++;
  }

  return {
    activeProject,
    entries: filtered,
    filter,
    setFilter,
    gitStatusMap,
    refreshSignal,
    gitFilter,
    setGitFilter,
    gitCounts,
    selectedPaths,
    contextMenu,
    setContextMenu,
    renaming,
    setRenaming,
    creating,
    setCreating,
    showIgnored,
    setShowIgnored,
    handleSelect,
    handleContextMenuOpen,
    handleDelete,
    handleRenameStart,
    handleRenameSubmit,
    handleNewEntry,
    handleCreateSubmit,
    handleCopyPath,
    handleOpenFile,
    handleBackgroundClick,
    handleBackgroundContextMenu,
  };
}
