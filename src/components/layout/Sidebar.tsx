import { useState } from "react";
import { IconPlus, IconSun, IconMoon } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppContext, type Project } from "@/contexts/AppContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn, PROJECT_COLORS } from "@/lib/utils";
import { SetupDialog } from "@/components/SetupDialog";

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar() {
  const {
    projects,
    activeProject,
    setActiveProject,
    addProject,
    projectConfigs,
    projectClaudeStatus,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();

  const [editProject, setEditProject] = useState<Project | null>(null);

  return (
    <>
      <div className="flex h-full w-[72px] flex-col items-center border-r border-border bg-sidebar pt-10 pb-2 gap-2">
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-2 px-[10px]">
            {projects.map((project) => {
              const config = projectConfigs.get(project.id);
              const label = config?.acronym || getInitials(project.name);
              const colorKey = config?.color;
              const isActive = activeProject?.id === project.id;

              const claudeStatus = projectClaudeStatus.get(project.id);

              return (
                <Tooltip key={project.id}>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => setActiveProject(project)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setEditProject(project);
                        }}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold transition-colors",
                          !colorKey &&
                            (isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"),
                          colorKey &&
                            !isActive &&
                            "opacity-60 hover:opacity-100",
                        )}
                        style={
                          colorKey && PROJECT_COLORS[colorKey]
                            ? {
                                backgroundColor: PROJECT_COLORS[colorKey].hex,
                                color: PROJECT_COLORS[colorKey].textHex,
                              }
                            : undefined
                        }
                      >
                        {label}
                      </button>
                      {claudeStatus && (
                        <div
                          className={cn(
                            "h-1.5 w-1.5 rounded-full transition-colors",
                            claudeStatus === "working" && "bg-blue-500",
                            claudeStatus === "idle" && "bg-green-500",
                            claudeStatus === "notification" && "bg-red-500 animate-pulse",
                            claudeStatus === "active" && "bg-blue-500",
                          )}
                        />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{project.name}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={addProject}>
                <IconPlus size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Project</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === "dark" ? (
                  <IconSun size={18} />
                ) : (
                  <IconMoon size={18} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {editProject && (
        <SetupDialog
          open={!!editProject}
          onOpenChange={(open) => {
            if (!open) setEditProject(null);
          }}
          initialConfig={projectConfigs.get(editProject.id)}
          projectPath={editProject.path}
        />
      )}
    </>
  );
}
