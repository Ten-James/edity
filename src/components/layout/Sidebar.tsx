import { useState } from "react";
import {
  IconPlus,
  IconSun,
  IconMoon,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

interface SidebarProps {
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const {
    projects,
    activeProject,
    setActiveProject,
    addProject,
    removeProject,
    reorderProjects,
    projectConfigs,
    projectClaudeStatus,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  return (
    <>
      <div className="flex h-full w-12 flex-col items-center bg-sidebar pt-1 pb-2 gap-1.5">
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-1.5 px-1.5">
            {projects.map((project, idx) => {
              const config = projectConfigs.get(project.id);
              const label = config?.acronym || getInitials(project.name);
              const isActive = activeProject?.id === project.id;
              const claudeStatus = projectClaudeStatus.get(project.id);
              const color = config?.color ? PROJECT_COLORS[config.color] : null;

              return (
                <ContextMenu key={project.id}>
                  <Tooltip>
                    <ContextMenuTrigger asChild>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center gap-1",
                            dragOverIdx === idx &&
                              dragIdx !== idx &&
                              "border-t-2 border-primary",
                          )}
                          draggable
                          onDragStart={() => setDragIdx(idx)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIdx(idx);
                          }}
                          onDragEnd={() => {
                            if (
                              dragIdx !== null &&
                              dragOverIdx !== null &&
                              dragIdx !== dragOverIdx
                            ) {
                              reorderProjects(dragIdx, dragOverIdx);
                            }
                            setDragIdx(null);
                            setDragOverIdx(null);
                          }}
                          onDragLeave={() => setDragOverIdx(null)}
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setActiveProject(project)}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center text-[11px] font-semibold transition-colors",
                              !isActive &&
                                "text-muted-foreground hover:bg-accent hover:text-foreground",
                              dragIdx === idx && "opacity-50",
                            )}
                            style={
                              isActive && color
                                ? {
                                    backgroundColor: color.hex,
                                    color: color.textHex,
                                  }
                                : isActive
                                  ? {
                                      backgroundColor: "var(--accent)",
                                      color: "var(--foreground)",
                                    }
                                  : undefined
                            }
                          >
                            {label}
                          </Button>
                          {claudeStatus && (
                            <div
                              className={cn(
                                "h-1 w-1 rounded-full transition-colors",
                                claudeStatus === "working" && "bg-blue-500",
                                claudeStatus === "idle" && "bg-green-500",
                                claudeStatus === "notification" &&
                                  "bg-red-500 animate-pulse",
                                claudeStatus === "active" && "bg-blue-500",
                              )}
                            />
                          )}
                        </div>
                      </TooltipTrigger>
                    </ContextMenuTrigger>
                    <TooltipContent side="right">{project.name}</TooltipContent>
                  </Tooltip>

                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => setEditProject(project)}>
                      <IconSettings size={14} />
                      Change
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => removeProject(project.id)}>
                      <IconTrash size={14} />
                      Remove
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={addProject}>
                <IconPlus size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Project</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onOpenSettings}>
                <IconSettings size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
                {theme === "dark" ? (
                  <IconSun size={16} />
                ) : (
                  <IconMoon size={16} />
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
