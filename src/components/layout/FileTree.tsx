import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconFile,
  IconFolderPlus,
  IconFilePlus,
  IconTrash,
  IconCopy,
  IconCursorText,
  IconFolder,
  IconEyeOff,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/contexts/AppContext";
import { invoke, listen } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { GitFileStatus } from "@/types/git";
import { FileTreeNode } from "./FileTreeNode";

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

type GitFilter = "all" | "M" | "A" | "D" | "?";

const GIT_FILTERS: { value: GitFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "text-foreground" },
  { value: "M", label: "M", color: "text-orange-400" },
  { value: "A", label: "A", color: "text-green-400" },
  { value: "D", label: "D", color: "text-red-400" },
  { value: "?", label: "?", color: "text-muted-foreground" },
];

function hasGitStatusInTree(
  entry: FileEntry,
  gitStatusMap: Map<string, string>,
  projectPath: string,
  filter: GitFilter,
): boolean {
  const rel = entry.path.replace(projectPath + "/", "");
  if (!entry.is_dir) {
    const status = gitStatusMap.get(rel) ?? null;
    return status === filter;
  }
  // Directory: check if any child matches
  for (const [path, status] of gitStatusMap) {
    if (path.startsWith(rel + "/") && status === filter) return true;
  }
  return false;
}

export function FileTree() {
  const { activeProject, openFileTab, closeTabsByFilePath } = useAppContext();
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

  const menuOpen = contextMenu !== null;
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const refreshTree = useCallback(() => {
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
  }, [activeProject, showIgnored]);

  useEffect(() => {
    refreshTree();

    if (!activeProject) {
      setEntries([]);
      setGitStatusMap(new Map());
      return;
    }

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
  }, [refreshTree, activeProject]);

  // Focus rename/create input when shown
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);
  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  const handleSelect = useCallback(
    (path: string, event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return next;
        });
      } else {
        setSelectedPaths(new Set([path]));
      }
    },
    [],
  );

  const handleContextMenuOpen = useCallback(
    (menu: FileTreeContextMenu) => {
      if (!selectedPaths.has(menu.entry.path)) {
        setSelectedPaths(new Set([menu.entry.path]));
      }
      setContextMenu(menu);
    },
    [selectedPaths],
  );

  const handleDelete = useCallback(async () => {
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
        closeTabsByFilePath(targetPath);
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
  }, [selectedPaths, closeTabsByFilePath]);

  const handleRenameStart = useCallback(() => {
    if (!contextMenu) return;
    setRenaming({ path: contextMenu.entry.path, name: contextMenu.entry.name });
    setContextMenu(null);
  }, [contextMenu]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renaming) return;
    const dir = renaming.path.substring(
      0,
      renaming.path.lastIndexOf("/"),
    );
    const newPath = `${dir}/${renaming.name}`;
    if (newPath === renaming.path) {
      setRenaming(null);
      return;
    }
    const result = await invoke<{ ok: boolean; error?: string }>(
      "rename_path",
      { oldPath: renaming.path, newPath },
    );
    if (result.ok) {
      closeTabsByFilePath(renaming.path);
      toast.success("Renamed");
    } else {
      toast.error(`Failed to rename: ${result.error}`);
    }
    setRenaming(null);
  }, [renaming, closeTabsByFilePath]);

  const handleNewEntry = useCallback(
    (type: "file" | "directory") => {
      if (!contextMenu) return;
      const parentDir = contextMenu.entry.is_dir
        ? contextMenu.entry.path
        : contextMenu.entry.path.substring(
            0,
            contextMenu.entry.path.lastIndexOf("/"),
          );
      setCreating({ parentDir, type, name: "" });
      setContextMenu(null);
    },
    [contextMenu],
  );

  const handleCreateSubmit = useCallback(async () => {
    if (!creating || !creating.name.trim()) {
      setCreating(null);
      return;
    }
    const fullPath = `${creating.parentDir}/${creating.name.trim()}`;
    const handler =
      creating.type === "file" ? "create_file" : "create_directory";
    const args =
      creating.type === "file"
        ? { filePath: fullPath }
        : { dirPath: fullPath };
    const result = await invoke<{ ok: boolean; error?: string }>(handler, args);
    if (result.ok) {
      toast.success(creating.type === "file" ? "File created" : "Folder created");
      if (creating.type === "file") {
        openFileTab(fullPath);
      }
    } else {
      toast.error(`Failed to create: ${result.error}`);
    }
    setCreating(null);
  }, [creating, openFileTab]);

  const handleCopyPath = useCallback(() => {
    if (!contextMenu) return;
    navigator.clipboard.writeText(contextMenu.entry.path);
    toast.success("Path copied");
    setContextMenu(null);
  }, [contextMenu]);

  const handleOpenFile = useCallback(() => {
    if (!contextMenu) return;
    if (!contextMenu.entry.is_dir) {
      openFileTab(contextMenu.entry.path);
    }
    setContextMenu(null);
  }, [contextMenu, openFileTab]);

  // Click on empty area to deselect
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        setSelectedPaths(new Set());
      }
    },
    [],
  );

  // Background context menu for new file/folder at root
  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget || !activeProject) return;
      e.preventDefault();
      setContextMenu({
        entry: { name: activeProject.name, path: activeProject.path, is_dir: true },
        x: e.clientX,
        y: e.clientY,
      });
    },
    [activeProject],
  );

  // Apply filters — keep folders if their name matches OR any descendant file matches
  let filtered = filter
    ? entries.filter((e) => {
        const lf = filter.toLowerCase();
        if (e.name.toLowerCase().includes(lf)) return true;
        if (!e.is_dir || !activeProject) return false;
        // Check if any git-tracked file inside this folder matches the filter
        const rel = e.path.replace(activeProject.path + "/", "");
        for (const [filePath] of gitStatusMap) {
          if (filePath.startsWith(rel + "/") && filePath.toLowerCase().includes(lf)) return true;
        }
        return true; // Keep all folders when filtering — children may match lazily
      })
    : entries;

  if (gitFilter !== "all" && activeProject) {
    filtered = filtered.filter((e) =>
      hasGitStatusInTree(e, gitStatusMap, activeProject.path, gitFilter),
    );
  }

  // Count git statuses for filter badges
  const gitCounts = { M: 0, A: 0, D: 0, "?": 0 };
  for (const status of gitStatusMap.values()) {
    if (status in gitCounts) {
      gitCounts[status as keyof typeof gitCounts]++;
    }
  }

  return (
    <div className="flex h-full w-[260px] flex-col bg-background shrink-0">
      <div className="flex items-center h-8 px-1.5 border-b border-border shrink-0">
        <Input
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-6 text-xs"
        />
      </div>

      {/* Inline rename input */}
      {renaming && (
        <div className="px-1.5 py-1 border-b border-border">
          <Input
            ref={renameInputRef}
            value={renaming.name}
            onChange={(e) =>
              setRenaming((prev) =>
                prev ? { ...prev, name: e.target.value } : null,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={handleRenameSubmit}
            className="h-6 text-xs"
          />
        </div>
      )}

      {/* Inline create input */}
      {creating && (
        <div className="px-1.5 py-1 border-b border-border">
          <div className="flex items-center gap-1 mb-0.5">
            {creating.type === "file" ? (
              <IconFile size={12} className="text-muted-foreground" />
            ) : (
              <IconFolder size={12} className="text-muted-foreground" />
            )}
            <span className="text-[10px] text-muted-foreground">
              New {creating.type === "file" ? "file" : "folder"} in{" "}
              {creating.parentDir.split("/").pop()}
            </span>
          </div>
          <Input
            ref={createInputRef}
            value={creating.name}
            onChange={(e) =>
              setCreating((prev) =>
                prev ? { ...prev, name: e.target.value } : null,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSubmit();
              if (e.key === "Escape") setCreating(null);
            }}
            onBlur={handleCreateSubmit}
            placeholder={creating.type === "file" ? "filename.ext" : "folder name"}
            className="h-6 text-xs"
          />
        </div>
      )}

      <ScrollArea className="flex-1 overflow-hidden">
        <div
          className="p-1 min-h-full"
          onClick={handleBackgroundClick}
          onContextMenu={handleBackgroundContextMenu}
        >
          {filtered.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              filter={filter}
              gitStatusMap={gitStatusMap}
              projectPath={activeProject?.path ?? ""}
              refreshSignal={refreshSignal}
              selectedPaths={selectedPaths}
              showIgnored={showIgnored}
              onSelect={handleSelect}
              onContextMenu={handleContextMenuOpen}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Git filter bar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border">
        {GIT_FILTERS.map((f) => {
          const count = f.value === "all" ? null : gitCounts[f.value as keyof typeof gitCounts];
          const isActive = gitFilter === f.value;
          return (
            <Button
              key={f.value}
              variant="ghost"
              size="xs"
              onClick={() => setGitFilter(f.value)}
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono transition-colors h-auto",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
                f.color,
              )}
            >
              {f.label}
              {count != null && count > 0 && (
                <span className="text-[9px] opacity-70">{count}</span>
              )}
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowIgnored((v) => !v)}
          title={showIgnored ? "Hiding gitignored files" : "Showing all files"}
          className={cn(
            "ml-auto p-0.5 h-auto transition-colors",
            showIgnored
              ? "text-accent-foreground bg-accent"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          <IconEyeOff size={12} />
        </Button>
      </div>

      {/* Context menu */}
      <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (!open) setContextMenu(null); }}>
        <DropdownMenuTrigger asChild>
          <span className="fixed w-0 h-0" style={{ left: contextMenu?.x ?? 0, top: contextMenu?.y ?? 0 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {contextMenu && !contextMenu.entry.is_dir && (
            <DropdownMenuItem onClick={handleOpenFile}>
              <IconFile size={14} />
              Open
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => handleNewEntry("file")}>
            <IconFilePlus size={14} />
            New File
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNewEntry("directory")}>
            <IconFolderPlus size={14} />
            New Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRenameStart}>
            <IconCursorText size={14} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyPath}>
            <IconCopy size={14} />
            Copy Path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-red-400 focus:text-red-400">
            <IconTrash size={14} />
            Delete{selectedPaths.size > 1 ? ` (${selectedPaths.size})` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
