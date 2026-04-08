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
import { Separator } from "@/components/ui/separator";
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
import { useProjectStore } from "@/stores/projectStore";
import { useClaudeStore } from "@/stores/claudeStore";
import { useActiveProjectIds } from "@/stores/layoutStore";
import { dispatch } from "@/stores/eventBus";
import type { Project } from "@shared/types/project";
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
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectStack = useProjectStore((s) => s.projectStack);
  const projectConfigs = useProjectStore((s) => s.edityConfigs);
  const projectClaudeStatus = useClaudeStore((s) => s.projectStatuses);
  const activeProjectIds = useActiveProjectIds();
  const { theme, toggleTheme } = useTheme();

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const renderProject = ({ project, idx }: { project: Project; idx: number }) => {
    const config = projectConfigs.get(project.id);
    const label = config?.acronym || getInitials(project.name);
    const isActive = activeProject?.id === project.id;
    const isInStack = projectStack.includes(project.id);
    const isInActiveGroup = activeProjectIds.has(project.id);
    const claudeStatus = projectClaudeStatus.get(project.id);
    const color = config?.color ? PROJECT_COLORS[config.color] : null;

    return (
      <ContextMenu key={project.id}>
        <Tooltip>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "relative flex flex-col items-center",
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
                    dispatch({
                      type: "project-reorder",
                      fromIndex: dragIdx,
                      toIndex: dragOverIdx,
                    });
                  }
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                onDragLeave={() => setDragOverIdx(null)}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      dispatch({
                        type: "project-stack-add",
                        projectId: project.id,
                      });
                    } else {
                      dispatch({
                        type: "project-switch",
                        projectId: project.id,
                      });
                    }
                  }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center text-[11px] font-semibold transition-colors",
                    !isInActiveGroup &&
                      "text-muted-foreground hover:bg-accent hover:text-foreground",
                    dragIdx === idx && "opacity-50",
                  )}
                  style={
                    isInActiveGroup && color
                      ? {
                          backgroundColor: color.hex,
                          color: color.textHex,
                          opacity: isActive ? 1 : isInStack ? 0.85 : 0.55,
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
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar transition-colors",
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
          <ContextMenuItem
            onClick={() =>
              dispatch({ type: "project-remove", projectId: project.id })
            }
          >
            <IconTrash size={14} />
            Remove
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const indexedProjects = projects.map((project, idx) => ({ project, idx }));
  const activeProjects = indexedProjects.filter(({ project }) =>
    activeProjectIds.has(project.id),
  );
  const otherProjects = indexedProjects.filter(
    ({ project }) => !activeProjectIds.has(project.id),
  );

  return (
    <>
      <div className="flex h-full w-12 flex-col items-center bg-sidebar pt-1 pb-2 gap-1.5">
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-1.5 px-1.5">
            {activeProjects.map(renderProject)}
            {activeProjects.length > 0 && otherProjects.length > 0 && (
              <Separator className="my-1 w-6 bg-border/60" />
            )}
            {otherProjects.map(renderProject)}
          </div>
        </ScrollArea>

        <div className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => dispatch({ type: "project-add" })}
              >
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
