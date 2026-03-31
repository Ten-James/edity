import { useState, useEffect } from "react";
import {
  IconFolder,
  IconGitBranch,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppContext } from "@/contexts/AppContext";
import { invoke, listen } from "@/lib/ipc";
import { RunButton } from "@/components/layout/RunButton";

const isDev = import.meta.env.DEV;

export function TopBar() {
  const {
    activeProject,
    fileTreeOpen,
    toggleFileTree,
    gitBranchInfo,
    gitDiffStats,
    createGitTab,
  } = useAppContext();

  const [homedir, setHomedir] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    invoke<string>("get_homedir").then(setHomedir);
    let unlisten: (() => void) | undefined;
    listen<boolean>("fullscreen-changed", (e) => setIsFullscreen(e.payload))
      .then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={`flex h-8 items-center bg-background pr-3 gap-2 shrink-0 ${isFullscreen ? "pl-3" : "pl-20"}`}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {isDev && (
        <span className="bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
          Dev
        </span>
      )}

      <span className="text-[11px] font-medium text-muted-foreground truncate">
        {activeProject
          ? homedir && activeProject.path.startsWith(homedir)
            ? "~" + activeProject.path.slice(homedir.length)
            : activeProject.path
          : "No Project"}
      </span>

      {gitBranchInfo && (
        <Button
          variant="ghost"
          size="xs"
          onClick={createGitTab}
          className="flex items-center gap-1 text-xs text-muted-foreground ml-1 hover:text-foreground transition-colors"
        >
          <IconGitBranch size={12} />
          {gitBranchInfo.current}
          {gitBranchInfo.ahead > 0 && (
            <span className="text-green-500 text-[10px]">
              {gitBranchInfo.ahead}↑
            </span>
          )}
          {gitBranchInfo.behind > 0 && (
            <span className="text-orange-500 text-[10px]">
              {gitBranchInfo.behind}↓
            </span>
          )}
          {gitDiffStats && (gitDiffStats.additions > 0 || gitDiffStats.deletions > 0 || gitDiffStats.changedFiles > 0) && (
            <span className="flex items-center gap-1 ml-1 text-[10px]">
              {gitDiffStats.additions > 0 && (
                <span className="text-green-500">+{gitDiffStats.additions}</span>
              )}
              {gitDiffStats.deletions > 0 && (
                <span className="text-red-500">-{gitDiffStats.deletions}</span>
              )}
              {gitDiffStats.changedFiles > 0 && (
                <span className="text-muted-foreground">^{gitDiffStats.changedFiles}</span>
              )}
            </span>
          )}
        </Button>
      )}

      <div className="flex-1" />

      <RunButton />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={fileTreeOpen ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={toggleFileTree}
          >
            <IconFolder size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle File Tree</TooltipContent>
      </Tooltip>
    </div>
  );
}
