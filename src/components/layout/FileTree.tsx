import { useCallback, useEffect, useState } from "react";
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconFile,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppContext } from "@/contexts/AppContext";
import { invoke } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { GitFileStatus } from "@/types/git";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

function getFileGitStatus(
  entryPath: string,
  projectPath: string,
  gitStatusMap: Map<string, string>,
): string | null {
  const rel = entryPath.replace(projectPath + "/", "");
  return gitStatusMap.get(rel) ?? null;
}

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

function FileTreeNode({
  entry,
  depth,
  filter,
  gitStatusMap,
  projectPath,
}: {
  entry: FileEntry;
  depth: number;
  filter: string;
  gitStatusMap: Map<string, string>;
  projectPath: string;
}) {
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
      });
      setChildren(entries);
    }
    setExpanded((v) => !v);
  }, [entry, expanded, openFileTab]);

  const filtered = filter
    ? children.filter((c) =>
        c.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : children;

  const gitStatus = !entry.is_dir
    ? getFileGitStatus(entry.path, projectPath, gitStatusMap)
    : null;

  return (
    <>
      <button
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-1 px-2 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm transition-colors",
          !entry.is_dir && "text-muted-foreground",
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
          />
        ))}
    </>
  );
}

export function FileTree() {
  const { activeProject } = useAppContext();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [gitStatusMap, setGitStatusMap] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    if (activeProject) {
      invoke<FileEntry[]>("list_directory", { path: activeProject.path }).then(
        setEntries,
      );

      // Fetch git status for the project
      invoke<{ ok: boolean; files?: GitFileStatus[] }>("git_status", {
        cwd: activeProject.path,
      }).then((result) => {
        if (result.ok && result.files) {
          const map = new Map<string, string>();
          for (const file of result.files) {
            // Use the most visible status (index or work tree)
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
    } else {
      setEntries([]);
      setGitStatusMap(new Map());
    }
  }, [activeProject]);

  const filtered = filter
    ? entries.filter((e) =>
        e.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : entries;

  return (
    <div className="flex h-full w-[260px] flex-col border-l border-border/50 bg-background shrink-0">
      <div className="p-1.5 border-b border-border">
        <Input
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-6 text-xs"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {filtered.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              filter={filter}
              gitStatusMap={gitStatusMap}
              projectPath={activeProject?.path ?? ""}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
