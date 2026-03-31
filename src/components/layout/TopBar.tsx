import { useState, useEffect } from "react";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconSettings,
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
import { invoke } from "@/lib/ipc";
import { SetupDialog } from "@/components/SetupDialog";

const isDev = import.meta.env.DEV;

export function TopBar() {
  const {
    activeProject,
    fileTreeOpen,
    toggleFileTree,
    edityConfig,
    runProject,
    stopProject,
    isProjectRunning,
    gitBranchInfo,
    gitDiffStats,
    createGitTab,
  } = useAppContext();

  const [setupOpen, setSetupOpen] = useState(false);
  const [homedir, setHomedir] = useState<string>("");

  useEffect(() => {
    invoke<string>("get_homedir").then(setHomedir);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
  };

  const hasRunCommand = !!edityConfig?.runCommand;

  return (
    <>
      <div
        onMouseDown={onMouseDown}
        className="flex h-8 items-center bg-background px-3 gap-2 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {isDev && (
          <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
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
          <button
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
          </button>
        )}

        <div className="flex-1" />

        {activeProject && !edityConfig && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setSetupOpen(true)}
              >
                <IconSettings size={16} />
                <span className="text-xs">Setup</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure project</TooltipContent>
          </Tooltip>
        )}

        {activeProject && edityConfig && !isProjectRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={runProject}
                disabled={!hasRunCommand}
              >
                <IconPlayerPlay size={16} />
                <span className="text-xs">Run</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasRunCommand
                ? edityConfig.runCommand
                : "No run command configured"}
            </TooltipContent>
          </Tooltip>
        )}

        {activeProject && edityConfig && isProjectRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-red-500 hover:text-red-600"
                onClick={stopProject}
              >
                <IconPlayerStop size={16} />
                <span className="text-xs">Stop</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop running process</TooltipContent>
          </Tooltip>
        )}

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

      {activeProject && (
        <SetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          initialConfig={edityConfig}
          projectPath={activeProject.path}
        />
      )}
    </>
  );
}
