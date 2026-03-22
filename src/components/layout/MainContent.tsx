import { useAppContext } from "@/contexts/AppContext";
import { TerminalView } from "@/components/Terminal";
import { FileViewer } from "@/components/FileViewer";
import { BrowserView } from "@/components/BrowserView";
import { GitView } from "@/components/git/GitView";
import { TopBar } from "./TopBar";
import { TabBar } from "./TabBar";
import { FileTree } from "./FileTree";

export function MainContent() {
  const { allTabs, activeTabId, fileTreeOpen } = useAppContext();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar />
      <TabBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          {allTabs.map((tab) => {
            switch (tab.type) {
              case "terminal":
                return (
                  <TerminalView
                    key={tab.id}
                    tabId={tab.id}
                    isActive={tab.id === activeTabId}
                    cwd={tab.projectPath}
                    initialCommand={tab.initialCommand}
                  />
                );
              case "file":
                return (
                  <FileViewer
                    key={tab.id}
                    tabId={tab.id}
                    filePath={tab.filePath}
                    isActive={tab.id === activeTabId}
                  />
                );
              case "browser":
                return (
                  <BrowserView
                    key={tab.id}
                    tabId={tab.id}
                    isActive={tab.id === activeTabId}
                    initialUrl={tab.url}
                  />
                );
              case "git":
                return (
                  <GitView
                    key={tab.id}
                    tabId={tab.id}
                    isActive={tab.id === activeTabId}
                    projectPath={tab.projectPath}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
        {fileTreeOpen && <FileTree />}
      </div>
    </div>
  );
}
