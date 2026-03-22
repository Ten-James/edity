import { useState } from "react";
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
    createGitTab,
  } = useAppContext();

  const [setupOpen, setSetupOpen] = useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
  };

  const hasRunCommand = !!edityConfig?.runCommand;

  return (
    <>
      <div
        onMouseDown={onMouseDown}
        className="flex h-10 items-center border-b border-border bg-card px-3 gap-2 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {isDev && (
          <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
            Dev
          </span>
        )}

        <span className="text-sm font-medium text-foreground truncate">
          {activeProject ? activeProject.name : "No Project"}
          <span className="text-muted-foreground"> / ~</span>
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
              size="icon"
              onClick={toggleFileTree}
            >
              <IconFolder size={16} />
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
