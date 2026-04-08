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
import { useProjectStore } from "@/stores/projectStore";
import { useRunStore } from "@/stores/runStore";
import { dispatch } from "@/stores/eventBus";
import { SetupDialog } from "@/components/SetupDialog";
import { useScriptDetection } from "@/hooks/useScriptDetection";
import {
  getRunCommands,
  getDefaultRunCommand,
  pickAutoDefault,
} from "@/lib/run-commands";
import type { RunCommand } from "@shared/types/project";
import type { DetectedScript } from "@shared/types/ipc";

const EMPTY_RUNNING_SET = new Set<string>();

export function RunButton() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const edityConfig = useProjectStore((s) =>
    s.activeProject ? (s.edityConfigs.get(s.activeProject.id) ?? null) : null,
  );
  const runningProjects = useRunStore((s) => s.runningProjects);
  const runningCommandIds = activeProject
    ? (runningProjects.get(activeProject.id) ?? EMPTY_RUNNING_SET)
    : EMPTY_RUNNING_SET;
  const isProjectRunning = runningCommandIds.size > 0;

  const runProject = (command?: RunCommand) => dispatch({ type: "run-start", command });
  const stopProject = (commandId?: string) => dispatch({ type: "run-stop", commandId });

  const detectedScripts = useScriptDetection(activeProject?.path);
  const [setupOpen, setSetupOpen] = useState(false);

  const configuredCommands = getRunCommands(edityConfig);
  const configuredDefault = getDefaultRunCommand(edityConfig);
  // Implicit default from detected project files (npm run dev/start,
  // go build, cargo build) — used when the project has no .edity config
  // or its runCommands list is empty. Lets Run work out of the box.
  const autoDefault = pickAutoDefault(detectedScripts);
  const effectiveDefault = configuredDefault ?? autoDefault;

  // Filter detected scripts that aren't already configured
  const extraScripts = detectedScripts.filter(
    (s) => !configuredCommands.some((c) => c.command === s.command),
  );

  const hasAnyCommand = !!effectiveDefault || extraScripts.length > 0;
  const hasDropdownItems =
    configuredCommands.length > 0 || extraScripts.length > 0;

  if (!activeProject) return null;

  // No config AND no detected scripts — fall back to a standalone Setup
  // button so the user can configure the project manually. Once any run
  // source exists (detected or configured), the full Run interface shows.
  if (!edityConfig && detectedScripts.length === 0) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 border-0"
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
      {/* Returns a flat sequence: [Run primary, divider?, chevron?]. The
          parent TopBar wraps this together with Git/Files into a single
          bordered container, so RunButton itself emits no border. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className={`gap-1 border-0 leading-none ${isProjectRunning ? "text-red-500 hover:text-red-600" : ""}`}
            onClick={() =>
              isProjectRunning
                ? stopProject()
                : runProject(effectiveDefault ?? undefined)
            }
            disabled={!isProjectRunning && !hasAnyCommand}
          >
            {isProjectRunning ? (
              <IconPlayerStop size={12} />
            ) : (
              <IconPlayerPlay size={12} />
            )}
            <span className="text-xs">
                {isProjectRunning ? "Stop" : "Run"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isProjectRunning
            ? "Stop all running processes"
            : (effectiveDefault?.command ?? "No run command configured")}
        </TooltipContent>
      </Tooltip>

      {/* Dropdown chevron — divider in front of it is rendered by TopBar
          as part of the global divider strategy. */}
      {hasDropdownItems && (
        <>
          <span
            aria-hidden
            className="self-stretch w-px bg-border"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="border-0"
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
                  {extraScripts.map((script, i) => {
                    // Mark the auto-detected default when there are no
                    // configured commands taking priority over it.
                    const isAutoDefault =
                      configuredCommands.length === 0 &&
                      autoDefault?.command === script.command;
                    return (
                      <DropdownMenuItem
                        key={`det-${i}`}
                        onClick={() => handleRunDetected(script)}
                        className="text-xs"
                      >
                        <IconPlayerPlay size={12} />
                        {script.name}
                        {isAutoDefault ? (
                          <DropdownMenuShortcut>Default</DropdownMenuShortcut>
                        ) : (
                          /* Hide the source label for package.json — npm
                             scripts dominate the list and the "package.json"
                             tag added visual noise without info value. */
                          script.source !== "package.json" && (
                            <DropdownMenuShortcut>
                              {script.source}
                            </DropdownMenuShortcut>
                          )
                        )}
                      </DropdownMenuItem>
                    );
                  })}
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
        </>
      )}

      <SetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        initialConfig={edityConfig}
        projectPath={activeProject.path}
      />
    </>
  );
}
