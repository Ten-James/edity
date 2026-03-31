import { useState, useEffect, useRef } from "react";
import { IconPlus, IconSun, IconMoon, IconSettings, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppContext, type Project } from "@/contexts/AppContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";
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
    removeProject,
    reorderProjects,
    projectConfigs,
    projectClaudeStatus,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [contextMenu, setContextMenu] = useState<{ project: Project; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [contextMenu]);

  return (
    <>
      <div className="flex h-full w-12 flex-col items-center bg-sidebar pt-9 pb-2 gap-1.5">
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-1.5 px-1.5">
            {projects.map((project, idx) => {
              const config = projectConfigs.get(project.id);
              const label = config?.acronym || getInitials(project.name);
              const isActive = activeProject?.id === project.id;

              const claudeStatus = projectClaudeStatus.get(project.id);

              return (
                <Tooltip key={project.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1",
                        dragOverIdx === idx && dragIdx !== idx && "border-t-2 border-primary",
                      )}
                      draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverIdx(idx);
                      }}
                      onDragEnd={() => {
                        if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                          reorderProjects(dragIdx, dragOverIdx);
                        }
                        setDragIdx(null);
                        setDragOverIdx(null);
                      }}
                      onDragLeave={() => setDragOverIdx(null)}
                    >
                      <button
                        onClick={() => setActiveProject(project)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ project, x: e.clientX, y: e.clientY });
                        }}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-sm text-[11px] font-semibold transition-colors",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          dragIdx === idx && "opacity-50",
                        )}
                      >
                        {label}
                      </button>
                      {claudeStatus && (
                        <div
                          className={cn(
                            "h-1 w-1 rounded-full transition-colors",
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
              <Button variant="ghost" size="icon-sm" onClick={addProject}>
                <IconPlus size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Project</TooltipContent>
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

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-40 rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setEditProject(contextMenu.project);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconSettings size={14} />
            Change
          </button>
          <button
            onClick={() => {
              removeProject(contextMenu.project.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconTrash size={14} />
            Remove
          </button>
        </div>
      )}

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
