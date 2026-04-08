import { Fragment, useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { dispatch } from "@/stores/eventBus";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileTree } from "./FileTree";
import { GitSidebar } from "./GitSidebar";
import { PaneContainer } from "./PaneContainer";
import { TabHost } from "./TabHost";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { LayoutNode, ProjectPaneState } from "@/types/tab";
import type { Project } from "@shared/types/project";

export function MainContent() {
  const projects = useProjectStore((s) => s.projects);
  const projectStack = useProjectStore((s) => s.projectStack);
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPanes = useLayoutStore((s) => s.projectPanes);
  const sidebarPanel = useLayoutStore((s) => s.sidebarPanel);

  const stackSet = new Set(projectStack);
  const hiddenProjects = projects.filter((p) => !stackSet.has(p.id));
  const stackProjects = projectStack
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);

  const isStackMode = stackProjects.length > 1;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* TabHost renders every tab view exactly once at a stable React tree
          position. Each tab's DOM is portaled into its current pane's slot,
          so React never unmounts tab content when the user splits, unsplits,
          or moves a tab — terminals, editor state, scroll, etc. all survive. */}
      <TabHost />

      {/* Hidden projects stay mounted so their PaneContainers keep their
          slot registration — TabHost host divs re-parent through any pane
          container remount. */}
      <div style={{ display: "none" }}>
        {hiddenProjects.map((project) => {
          const state = projectPanes.get(project.id);
          if (!state) return null;
          return (
            <NodeRenderer
              key={project.id}
              node={state.root}
              state={state}
              isActive={false}
              projectId={project.id}
            />
          );
        })}
      </div>

      {isStackMode ? (
        <ResizablePanelGroup
          id="project-stack"
          orientation="horizontal"
          className="flex-1"
        >
          {stackProjects.map((project, idx) => {
            const state = projectPanes.get(project.id);
            if (!state) return null;
            const isFocused = project.id === activeProject?.id;
            return (
              <Fragment key={project.id}>
                {idx > 0 && <ResizableHandle withHandle />}
                <ResizablePanel
                  id={`stack-project-${project.id}`}
                  defaultSize={100 / stackProjects.length}
                  minSize={15}
                  className="flex flex-col"
                >
                  <StackProjectFrame project={project} isFocused={isFocused}>
                    <NodeRenderer
                      node={state.root}
                      state={state}
                      isActive
                      projectId={project.id}
                    />
                  </StackProjectFrame>
                </ResizablePanel>
              </Fragment>
            );
          })}
        </ResizablePanelGroup>
      ) : (
        stackProjects.map((project) => {
          const state = projectPanes.get(project.id);
          if (!state) return null;
          return (
            <div
              key={project.id}
              className="flex-1 flex overflow-hidden"
            >
              <NodeRenderer
                node={state.root}
                state={state}
                isActive
                projectId={project.id}
              />
            </div>
          );
        })
      )}

      {sidebarPanel === "files" && <FileTree />}
      {sidebarPanel === "git" && <GitSidebar />}
    </div>
  );
}

interface StackProjectFrameProps {
  project: Project;
  isFocused: boolean;
  children: React.ReactNode;
}

/**
 * Wraps one project's pane tree inside the horizontal stack: adds a header
 * strip with the project name and a close (×) button, and a focus border
 * that highlights which project currently drives the TopBar.
 *
 * Focus handling uses a NATIVE DOM pointerdown listener (not React's
 * synthetic `onPointerDown`). Tab content (terminals, editors, etc.) lives
 * in React portals created by TabHost, whose synthetic events bubble
 * through the React tree — which means they reach TabHost, NOT the
 * StackProjectFrame that visually contains the portaled host div. Native
 * DOM events, on the other hand, bubble through the actual DOM tree, so a
 * click on an xterm canvas does reach the StackProjectFrame's root div
 * because the host div is appendChild'd into the slot beneath it.
 */
function StackProjectFrame({
  project,
  isFocused,
  children,
}: StackProjectFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused) return;
    const el = frameRef.current;
    if (!el) return;
    const handler = () => {
      dispatch({ type: "project-switch", projectId: project.id });
    };
    el.addEventListener("pointerdown", handler);
    return () => {
      el.removeEventListener("pointerdown", handler);
    };
  }, [project.id, isFocused]);

  return (
    <div
      ref={frameRef}
      className={cn(
        "flex flex-col flex-1 overflow-hidden border-t-2 transition-colors",
        isFocused ? "border-primary" : "border-transparent",
      )}
    >
      <div className="flex items-center justify-between px-2 py-0.5 bg-sidebar/50 text-[10px] text-muted-foreground shrink-0 select-none">
        <span className="truncate font-medium">{project.name}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-4 w-4"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({
              type: "project-stack-remove",
              projectId: project.id,
            });
          }}
        >
          <IconX size={10} />
        </Button>
      </div>
      {children}
    </div>
  );
}

interface NodeRendererProps {
  node: LayoutNode;
  state: ProjectPaneState;
  isActive: boolean;
  projectId: string;
}

/**
 * Recursively renders a layout tree as nested ResizablePanelGroups.
 *
 * - A `leaf` becomes a single PaneContainer.
 * - A `split` becomes a ResizablePanelGroup whose two ResizablePanel
 *   children recurse on the split's children.
 *
 * The PanelGroup `id` is the split node id, and each ResizablePanel `id` is
 * derived from the child subtree's identity (leaf pane id or nested split
 * id). This gives react-resizable-panels stable identifiers across renders
 * so it doesn't lose its layout when an unrelated branch updates.
 */
function NodeRenderer({
  node,
  state,
  isActive,
  projectId,
}: NodeRendererProps) {
  if (node.type === "leaf") {
    return (
      <PaneContainer
        paneId={node.pane.id}
        isFocused={node.pane.id === state.focusedPaneId}
        showTabBar={isActive}
      />
    );
  }

  return (
    <ResizablePanelGroup
      id={`panel-group-${node.id}`}
      orientation={node.orientation}
      className="flex-1"
    >
      {node.children.map((child, idx) => (
        <Fragment key={childKey(child)}>
          {idx > 0 && <ResizableHandle withHandle />}
          <ResizablePanel
            id={`panel-${childKey(child)}`}
            defaultSize="50%"
            minSize="10%"
            className="flex flex-col"
          >
            <NodeRenderer
              node={child}
              state={state}
              isActive={isActive}
              projectId={projectId}
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

function childKey(node: LayoutNode): string {
  return node.type === "leaf" ? node.pane.id : node.id;
}
