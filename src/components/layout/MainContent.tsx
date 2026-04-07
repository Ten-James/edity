import { Fragment } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore } from "@/stores/layoutStore";
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

export function MainContent() {
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPanes = useLayoutStore((s) => s.projectPanes);
  const sidebarPanel = useLayoutStore((s) => s.sidebarPanel);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* TabHost renders every tab view exactly once at a stable React tree
          position. Each tab's DOM is portaled into its current pane's slot,
          so React never unmounts tab content when the user splits, unsplits,
          or moves a tab — terminals, editor state, scroll, etc. all survive. */}
      <TabHost />

      {/* Render pane layouts for ALL projects — inactive ones are hidden but stay mounted */}
      {projects.map((project) => {
        const state = projectPanes.get(project.id);
        if (!state) return null;
        const isActive = project.id === activeProject?.id;
        return (
          <div
            key={project.id}
            className="flex-1 flex overflow-hidden"
            style={{ display: isActive ? "flex" : "none" }}
          >
            <NodeRenderer
              node={state.root}
              state={state}
              isActive={isActive}
              projectId={project.id}
            />
          </div>
        );
      })}
      {sidebarPanel === "files" && <FileTree />}
      {sidebarPanel === "git" && <GitSidebar />}
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
