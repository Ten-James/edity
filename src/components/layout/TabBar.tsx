import {
  IconTerminal2,
  IconFile,
  IconWorld,
  IconGitBranch,
  IconRobot,
  IconX,
  IconPlus,
  IconLayoutColumns,
  IconLayoutRows,
  IconArrowMoveRight,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types/tab";

interface TabBarProps {
  paneId: string;
}

export function TabBar({ paneId }: TabBarProps) {
  const {
    panes,
    setActiveTab,
    createTab,
    createBrowserTab,
    createGitTab,
    createClaudeTab,
    closeTab,
    pinTab,
    dirtyTabs,
    splitPane,
    moveTabToPane,
  } = useAppContext();

  const pane = panes.find((p) => p.id === paneId);
  const paneTabs = pane?.tabs ?? [];
  const paneActiveTabId = pane?.activeTabId ?? null;
  const otherPaneId = panes.find((p) => p.id !== paneId)?.id;

  function getTabIcon(tab: Tab) {
    switch (tab.type) {
      case "terminal":
        return <IconTerminal2 size={14} />;
      case "file":
        return <IconFile size={14} />;
      case "browser":
        return <IconWorld size={14} />;
      case "git":
        return <IconGitBranch size={14} />;
      case "claude":
        return <IconRobot size={14} />;
    }
  }

  return (
    <div className="flex h-8 items-center bg-background shrink-0">
      <div className="flex flex-1 items-center overflow-x-auto">
        {paneTabs.map((tab) => (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={() => {
                  if (tab.type === "file" && tab.isTemporary) {
                    pinTab(tab.id);
                  }
                }}
                role="tab"
                className={cn(
                  "group flex items-center gap-1.5 px-2.5 h-8 text-xs shrink-0 transition-colors cursor-pointer select-none",
                  paneActiveTabId === tab.id
                    ? "text-foreground border-b-2 border-b-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {getTabIcon(tab)}
                <span className={cn(tab.type === "file" && tab.isTemporary && "italic")}>
                  {tab.title}
                </span>
                {dirtyTabs.has(tab.id) && (
                  <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="ml-1 size-4 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                >
                  <IconX size={10} />
                </Button>
              </div>
            </ContextMenuTrigger>

            <ContextMenuContent>
              {panes.length < 2 && (
                <>
                  <ContextMenuItem onClick={() => splitPane("horizontal", tab.id)}>
                    <IconLayoutColumns size={14} />
                    Split Right
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => splitPane("vertical", tab.id)}>
                    <IconLayoutRows size={14} />
                    Split Down
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              {panes.length === 2 && otherPaneId && (
                <>
                  <ContextMenuItem onClick={() => moveTabToPane(tab.id, otherPaneId)}>
                    <IconArrowMoveRight size={14} />
                    Move to Other Pane
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem onClick={() => closeTab(tab.id)}>
                <IconX size={14} />
                Close
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <IconPlus size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => createTab()}>
            <IconTerminal2 size={14} />
            New Terminal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => createBrowserTab()}>
            <IconWorld size={14} />
            New Browser
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => createGitTab()}>
            <IconGitBranch size={14} />
            Git
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => createClaudeTab()}>
            <IconRobot size={14} />
            Claude
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
