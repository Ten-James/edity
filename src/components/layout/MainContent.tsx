import { useProjectStore } from "@/stores/projectStore";
import { useLayoutStore, useAllTabs } from "@/stores/layoutStore";
import { FileTree } from "./FileTree";
import { GitSidebar } from "./GitSidebar";
import { PaneContainer } from "./PaneContainer";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { AllTab } from "@/types/tab";

export function MainContent() {
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPanes = useLayoutStore((s) => s.projectPanes);
  const sidebarPanel = useLayoutStore((s) => s.sidebarPanel);
  const allTabs = useAllTabs();

  const tabsByPane = new Map<string, AllTab[]>();
  for (const tab of allTabs) {
    let arr = tabsByPane.get(tab.paneId);
    if (!arr) {
      arr = [];
      tabsByPane.set(tab.paneId, arr);
    }
    arr.push(tab);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Render pane layouts for ALL projects — inactive ones are hidden but stay mounted */}
      {projects.map((project) => {
        const state = projectPanes.get(project.id);
        if (!state) return null;
        const isActive = project.id === activeProject?.id;
        const { panes } = state;

        return (
          <div
            key={project.id}
            className="flex-1 flex overflow-hidden"
            style={{ display: isActive ? "flex" : "none" }}
          >
            {panes.length <= 1 ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {panes[0] && (
                  <PaneContainer
                    paneId={panes[0].id}
                    isFocused={true}
                    tabs={tabsByPane.get(panes[0].id) ?? []}
                    activeTabId={panes[0].activeTabId}
                    showTabBar={isActive}
                  />
                )}
              </div>
            ) : (
              <ResizablePanelGroup
                orientation={state.splitDirection}
                className="flex-1"
              >
                <ResizablePanel
                  defaultSize={50}
                  minSize={20}
                  className="flex flex-col"
                >
                  <PaneContainer
                    paneId={panes[0].id}
                    isFocused={panes[0].id === state.focusedPaneId}
                    tabs={tabsByPane.get(panes[0].id) ?? []}
                    activeTabId={panes[0].activeTabId}
                    showTabBar={isActive}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                  defaultSize={50}
                  minSize={20}
                  className="flex flex-col"
                >
                  <PaneContainer
                    paneId={panes[1].id}
                    isFocused={panes[1].id === state.focusedPaneId}
                    tabs={tabsByPane.get(panes[1].id) ?? []}
                    activeTabId={panes[1].activeTabId}
                    showTabBar={isActive}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        );
      })}
      {sidebarPanel === "files" && <FileTree />}
      {sidebarPanel === "git" && <GitSidebar />}
    </div>
  );
}
