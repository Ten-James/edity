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
        const { panes } = state;
        if (panes.length === 0) return null;

        // Always render the same ResizablePanelGroup tree regardless of pane
        // count, with stable keys. Combined with the TabHost portal layer,
        // this guarantees that splitting or unsplitting never remounts pane
        // content.
        const defaultSize = 100 / panes.length;

        return (
          <div
            key={project.id}
            className="flex-1 flex overflow-hidden"
            style={{ display: isActive ? "flex" : "none" }}
          >
            <ResizablePanelGroup
              id={`pane-group-${project.id}`}
              orientation={state.splitDirection}
              className="flex-1"
            >
              {panes.map((pane, idx) => (
                <Fragment key={pane.id}>
                  {idx > 0 && <ResizableHandle withHandle />}
                  <ResizablePanel
                    id={pane.id}
                    defaultSize={defaultSize}
                    minSize={20}
                    className="flex flex-col"
                  >
                    <PaneContainer
                      key={pane.id}
                      paneId={pane.id}
                      isFocused={
                        panes.length === 1 || pane.id === state.focusedPaneId
                      }
                      showTabBar={isActive}
                    />
                  </ResizablePanel>
                </Fragment>
              ))}
            </ResizablePanelGroup>
          </div>
        );
      })}
      {sidebarPanel === "files" && <FileTree />}
      {sidebarPanel === "git" && <GitSidebar />}
    </div>
  );
}
