import { useCallback, useEffect, useState } from "react";
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconFile,
} from "@tabler/icons-react";
import { useAppContext } from "@/contexts/AppContext";
import { invoke } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { FileEntry, FileTreeContextMenu } from "./FileTree";

function statusIndicatorColor(status: string) {
  switch (status) {
    case "M":
      return "text-orange-400";
    case "A":
      return "text-green-400";
    case "D":
      return "text-red-400";
    case "?":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function getFileGitStatus(
  entryPath: string,
  projectPath: string,
  gitStatusMap: Map<string, string>,
): string | null {
  const rel = entryPath.replace(projectPath + "/", "");
  return gitStatusMap.get(rel) ?? null;
}

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  filter: string;
  gitStatusMap: Map<string, string>;
  projectPath: string;
  refreshSignal: number;
  selectedPaths: Set<string>;
  showIgnored: boolean;
  onSelect: (path: string, event: React.MouseEvent) => void;
  onContextMenu: (menu: FileTreeContextMenu) => void;
}

export function FileTreeNode({
  entry,
  depth,
  filter,
  gitStatusMap,
  projectPath,
  refreshSignal,
  selectedPaths,
  showIgnored,
  onSelect,
  onContextMenu,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);

  const { openFileTab } = useAppContext();

  const toggle = useCallback(async () => {
    if (!entry.is_dir) {
      openFileTab(entry.path);
      return;
    }
    if (!expanded) {
      const entries = await invoke<FileEntry[]>("list_directory", {
        path: entry.path,
        showIgnored,
      });
      setChildren(entries);
    }
    setExpanded((v) => !v);
  }, [entry, expanded, openFileTab, showIgnored]);

  useEffect(() => {
    if (expanded && entry.is_dir && refreshSignal > 0) {
      invoke<FileEntry[]>("list_directory", {
        path: entry.path,
        showIgnored,
      }).then(setChildren);
    }
  }, [refreshSignal, expanded, entry.is_dir, entry.path, showIgnored]);

  const filtered = filter
    ? children.filter((c) => {
        if (c.name.toLowerCase().includes(filter.toLowerCase())) return true;
        // Keep folders — their children may match
        return c.is_dir;
      })
    : children;

  const gitStatus = !entry.is_dir
    ? getFileGitStatus(entry.path, projectPath, gitStatusMap)
    : null;

  const isSelected = selectedPaths.has(entry.path);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSelect(entry.path, e);
      toggle();
    },
    [entry.path, onSelect, toggle],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isSelected) {
        onSelect(entry.path, e);
      }
      onContextMenu({ entry, x: e.clientX, y: e.clientY });
    },
    [entry, isSelected, onSelect, onContextMenu],
  );

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "flex w-full items-center gap-1 px-2 py-0.5 text-xs rounded-sm transition-colors",
          isSelected
            ? "bg-primary/20 text-accent-foreground"
            : "hover:bg-accent hover:text-accent-foreground",
          !entry.is_dir && !isSelected && "text-muted-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {entry.is_dir ? (
          <>
            {expanded ? (
              <IconChevronDown size={13} className="shrink-0" />
            ) : (
              <IconChevronRight size={13} className="shrink-0" />
            )}
            {expanded ? (
              <IconFolderOpen size={13} className="shrink-0" />
            ) : (
              <IconFolder size={13} className="shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <IconFile size={13} className="shrink-0" />
          </>
        )}
        <span className="truncate flex-1 text-left">{entry.name}</span>
        {gitStatus && (
          <span
            className={cn(
              "ml-auto shrink-0 text-[10px] font-mono",
              statusIndicatorColor(gitStatus),
            )}
          >
            {gitStatus}
          </span>
        )}
      </button>
      {expanded &&
        filtered.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            filter={filter}
            gitStatusMap={gitStatusMap}
            projectPath={projectPath}
            refreshSignal={refreshSignal}
            selectedPaths={selectedPaths}
            showIgnored={showIgnored}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}
