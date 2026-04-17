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

export interface SearchMatch {
  files: Set<string>;
  dirs: Set<string>;
}

interface SearchFilesResponse {
  matchedFiles: string[];
  matchedDirs: string[];
}

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
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [gitFilter, setGitFilter] = useState<GitFilter>("all");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenu | null>(
    null,
  );
  const [renaming, setRenaming] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [creating, setCreating] = useState<{
    parentDir: string;
    type: "file" | "directory";
    name: string;
  } | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [searchMatch, setSearchMatch] = useState<SearchMatch | null>(null);

  // Debounced recursive search — fetches the set of files & ancestor dirs
  // that match the current filter so the tree can hide folders without any
  // matching descendants. When the filter is empty we fall back to the
  // normal lazy-loaded tree (searchMatch === null).
  useEffect(() => {
    if (!activeProject) {
      setSearchMatch(null);
      return;
    }
    const trimmed = filter.trim();
    if (!trimmed) {
      setSearchMatch(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      invoke<SearchFilesResponse>("search_files", {
        rootPath: activeProject.path,
        query: trimmed,
        showIgnored,
      })
        .then((result) => {
          if (cancelled) return;
          setSearchMatch({
            files: new Set(result.matchedFiles),
            dirs: new Set(result.matchedDirs),
          });
        })
        .catch(() => {
          if (!cancelled) setSearchMatch(null);
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filter, showIgnored, activeProject]);

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

  // Clear file tree state when the active project becomes null.
  const [prevActiveProject, setPrevActiveProject] = useState(activeProject);
  if (prevActiveProject !== activeProject) {
    setPrevActiveProject(activeProject);
    if (!activeProject) {
      setEntries([]);
      setGitStatusMap(new Map());
    }
  }

  // Watch project directory
  useEffect(() => {
    if (!activeProject) return;

    refreshTree();

    let unlisten: (() => void) | null = null;
    invoke("watch_project_dir", { projectPath: activeProject.path }).catch(
      () => {},
    );

    listen("directory-changed", () => {
      refreshTree();
      setRefreshSignal((s) => s + 1);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      invoke("unwatch_project_dir").catch(() => {});
    };
    // refreshTree is recreated each render but only depends on activeProject/showIgnored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const result = await invoke<{ ok: boolean; error?: string }>(
        "delete_path",
        { targetPath },
      );
      if (result.ok) {
        dispatch({ type: "tab-close-by-filepath", filePath: targetPath });
        successCount++;
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    }
    setSelectedPaths(new Set());
    if (successCount > 0) {
      toast.success(
        successCount === 1 ? "Deleted" : `Deleted ${successCount} items`,
      );
    }
  }

  function handleRenameStart() {
    if (!contextMenu) return;
    const { path, name } = contextMenu.entry;
    setRenaming({ path, name });
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
    const result = await invoke<{ ok: boolean; error?: string }>(
      "rename_path",
      {
        oldPath: renaming.path,
        newPath,
      },
    );
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
      : contextMenu.entry.path.substring(
          0,
          contextMenu.entry.path.lastIndexOf("/"),
        );
    setCreating({ parentDir, type, name: "" });
    setContextMenu(null);
  }

  async function handleCreateSubmit() {
    if (!creating) return;
    if (!creating.name.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = `${creating.parentDir}/${creating.name.trim()}`;
    const handler =
      creating.type === "file" ? "create_file" : "create_directory";
    const args =
      creating.type === "file" ? { filePath: fullPath } : { dirPath: fullPath };
    const result = await invoke<{ ok: boolean; error?: string }>(handler, args);
    if (result.ok) {
      toast.success(
        creating.type === "file" ? "File created" : "Folder created",
      );
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
      entry: {
        name: activeProject.name,
        path: activeProject.path,
        is_dir: true,
      },
      x: e.clientX,
      y: e.clientY,
    });
  }

  // Filtering: when a recursive search has resolved, hide entries that
  // neither match the query themselves nor contain a matching descendant.
  // While the search is still in flight (`filter` set but `searchMatch`
  // not yet populated) we fall back to a name-only filter so the tree
  // doesn't flash an empty state.
  let filtered: FileEntry[];
  if (searchMatch) {
    filtered = entries.filter(
      (e) => searchMatch.files.has(e.path) || searchMatch.dirs.has(e.path),
    );
  } else if (filter) {
    const lf = filter.toLowerCase();
    filtered = entries.filter(
      (e) => e.name.toLowerCase().includes(lf) || e.is_dir,
    );
  } else {
    filtered = entries;
  }

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
    searchMatch,
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
