import { useEffect, useState } from "react";
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { getFileIcon } from "@/lib/file-icons";
import { dispatch } from "@/stores/eventBus";
import { invoke } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type {
  FileEntry,
  FileTreeContextMenu,
  SearchMatch,
} from "@/hooks/useFileTree";

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
  searchMatch: SearchMatch | null;
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
  searchMatch,
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

  // While a search is active, force any folder that contains a match to be
  // visually expanded so the user can see the matching descendants without
  // having to click into every folder. The user's manual `expanded` state
  // is preserved and takes effect again when the search is cleared.
  const isInSearch =
    searchMatch !== null && entry.is_dir && searchMatch.dirs.has(entry.path);
  const effectiveExpanded = isInSearch ? true : expanded;

  // Auto-load children when a folder becomes part of the search results.
  // Without this, lazy-loaded folders that the user never opened manually
  // would render expanded but empty during search.
  useEffect(() => {
    if (!isInSearch || !entry.is_dir) return;
    let cancelled = false;
    invoke<FileEntry[]>("list_directory", {
      path: entry.path,
      showIgnored,
    }).then((entries) => {
      if (!cancelled) setChildren(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [isInSearch, entry.is_dir, entry.path, showIgnored]);

  const toggle = async () => {
    if (!entry.is_dir) {
      dispatch({ type: "tab-open-file", filePath: entry.path });
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
  };

  useEffect(() => {
    if (expanded && entry.is_dir && refreshSignal > 0) {
      invoke<FileEntry[]>("list_directory", {
        path: entry.path,
        showIgnored,
      }).then(setChildren);
    }
  }, [refreshSignal, expanded, entry.is_dir, entry.path, showIgnored]);

  // Children filtering: when a search is in progress, only keep entries
  // that the backend reported as matching (or whose ancestor chain
  // matches). Outside of search mode, fall back to a name-only filter
  // and keep folders unconditionally so the user can drill into them.
  let filtered: FileEntry[];
  if (searchMatch) {
    filtered = children.filter(
      (c) => searchMatch.files.has(c.path) || searchMatch.dirs.has(c.path),
    );
  } else if (filter) {
    const lf = filter.toLowerCase();
    filtered = children.filter(
      (c) => c.name.toLowerCase().includes(lf) || c.is_dir,
    );
  } else {
    filtered = children;
  }

  const gitStatus = !entry.is_dir
    ? getFileGitStatus(entry.path, projectPath, gitStatusMap)
    : null;

  const isSelected = selectedPaths.has(entry.path);

  const handleClick = (e: React.MouseEvent) => {
    onSelect(entry.path, e);
    toggle();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelected) {
      onSelect(entry.path, e);
    }
    onContextMenu({ entry, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <Button
        variant="ghost"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "flex w-full items-center justify-start gap-1 pr-2 h-6 text-xs transition-colors",
          isSelected
            ? "bg-primary/20 text-accent-foreground"
            : "hover:bg-accent hover:text-accent-foreground",
          !entry.is_dir && !isSelected && "text-muted-foreground",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {entry.is_dir ? (
          <>
            {effectiveExpanded ? (
              <IconChevronDown size={13} className="shrink-0" />
            ) : (
              <IconChevronRight size={13} className="shrink-0" />
            )}
            {effectiveExpanded ? (
              <IconFolderOpen size={13} className="shrink-0" />
            ) : (
              <IconFolder size={13} className="shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            {(() => {
              const FileIcon = getFileIcon(entry.name);
              return <FileIcon size={13} className="shrink-0" />;
            })()}
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
      </Button>
      {effectiveExpanded &&
        filtered.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            filter={filter}
            searchMatch={searchMatch}
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
