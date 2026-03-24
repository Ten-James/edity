import { useAppContext } from "@/contexts/AppContext";
import { TerminalView } from "@/components/Terminal";
import { FileViewer } from "@/components/FileViewer";
import { BrowserView } from "@/components/BrowserView";
import { GitView } from "@/components/git/GitView";
import { TabBar } from "./TabBar";
import { cn } from "@/lib/utils";
import type { AllTab } from "@/types/tab";

interface PaneContainerProps {
  paneId: string;
  isFocused: boolean;
  tabs: AllTab[];
  activeTabId: string | null;
  showTabBar: boolean;
}

export function PaneContainer({
  paneId,
  isFocused,
  tabs,
  activeTabId,
  showTabBar,
}: PaneContainerProps) {
  const { panes, setFocusedPane } = useAppContext();

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden",
        isFocused && panes.length > 1 && "ring-1 ring-inset ring-accent",
      )}
      onPointerDown={() => {
        if (!isFocused) setFocusedPane(paneId);
      }}
    >
      {showTabBar && <TabBar paneId={paneId} />}
      <div className="flex-1 relative">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          switch (tab.type) {
            case "terminal":
              return (
                <TerminalView
                  key={tab.id}
                  tabId={tab.id}
                  isActive={isActive}
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
                  isActive={isActive}
                />
              );
            case "browser":
              return (
                <BrowserView
                  key={tab.id}
                  tabId={tab.id}
                  isActive={isActive}
                  initialUrl={tab.url}
                />
              );
            case "git":
              return (
                <GitView
                  key={tab.id}
                  tabId={tab.id}
                  isActive={isActive}
                  projectPath={tab.projectPath}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
