import { useState } from "react";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconChevronDown,
  IconSettings,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/contexts/AppContext";
import { SetupDialog } from "@/components/SetupDialog";
import { useScriptDetection } from "@/hooks/useScriptDetection";
import { getRunCommands, getDefaultRunCommand } from "@/lib/run-commands";
import type { RunCommand } from "@shared/types/project";
import type { DetectedScript } from "@shared/types/ipc";

export function RunButton() {
  const {
    activeProject,
    edityConfig,
    runProject,
    stopProject,
    isProjectRunning,
    runningCommandIds,
  } = useAppContext();

  const detectedScripts = useScriptDetection(activeProject?.path);
  const [setupOpen, setSetupOpen] = useState(false);

  const configuredCommands = getRunCommands(edityConfig);
  const defaultCommand = getDefaultRunCommand(edityConfig);

  // Filter detected scripts that aren't already configured
  const extraScripts = detectedScripts.filter(
    (s) => !configuredCommands.some((c) => c.command === s.command),
  );

  const hasAnyCommand = defaultCommand || extraScripts.length > 0;
  const hasDropdownItems =
    configuredCommands.length > 0 || extraScripts.length > 0;

  if (!activeProject) return null;

  // No config at all — show setup button
  if (!edityConfig) {
    return (
      <>
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
        <SetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          projectPath={activeProject.path}
        />
      </>
    );
  }

  const handleRunDetected = (script: DetectedScript) => {
    const cmd: RunCommand = {
      name: script.name,
      command: script.command,
      mode: "terminal",
    };
    runProject(cmd);
  };

  return (
    <>
      <div className="flex items-center">
        {/* Primary button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`gap-1 ${hasDropdownItems ? "rounded-r-none" : ""} ${isProjectRunning ? "text-red-500 hover:text-red-600" : ""}`}
              onClick={() => (isProjectRunning ? stopProject() : runProject())}
              disabled={!isProjectRunning && !hasAnyCommand}
            >
              {isProjectRunning ? (
                <IconPlayerStop size={16} />
              ) : (
                <IconPlayerPlay size={16} />
              )}
              <span className="text-xs">
                {isProjectRunning ? "Stop" : "Run"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isProjectRunning
              ? "Stop all running processes"
              : (defaultCommand?.command ?? "No run command configured")}
          </TooltipContent>
        </Tooltip>

        {/* Dropdown chevron */}
        {hasDropdownItems && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="rounded-l-none border-l border-border/50"
              >
                <IconChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {/* Running processes */}
              {isProjectRunning && runningCommandIds.size > 0 && (
                <>
                  <DropdownMenuLabel className="text-[10px]">
                    Running
                  </DropdownMenuLabel>
                  {[...runningCommandIds].map((id) => (
                    <DropdownMenuItem
                      key={id}
                      onClick={() => stopProject(id)}
                      className="text-xs text-red-500"
                    >
                      <IconPlayerStop size={12} />
                      {id}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Configured commands */}
              {configuredCommands.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[10px]">
                    Commands
                  </DropdownMenuLabel>
                  {configuredCommands.map((cmd, i) => (
                    <DropdownMenuItem
                      key={`cfg-${i}`}
                      onClick={() => runProject(cmd)}
                      className="text-xs"
                    >
                      <IconPlayerPlay size={12} />
                      {cmd.name || cmd.command}
                      {i === 0 && (
                        <DropdownMenuShortcut>Default</DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Detected scripts */}
              {extraScripts.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px]">
                    Detected Scripts
                  </DropdownMenuLabel>
                  {extraScripts.map((script, i) => (
                    <DropdownMenuItem
                      key={`det-${i}`}
                      onClick={() => handleRunDetected(script)}
                      className="text-xs"
                    >
                      <IconPlayerPlay size={12} />
                      {script.name}
                      <DropdownMenuShortcut>
                        {script.source}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Configure */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSetupOpen(true)}
                className="text-xs"
              >
                <IconSettings size={12} />
                Configure...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <SetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        initialConfig={edityConfig}
        projectPath={activeProject.path}
      />
    </>
  );
}
