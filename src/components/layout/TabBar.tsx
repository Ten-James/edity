import {
  IconTerminal2,
  IconFile,
  IconWorld,
  IconGitBranch,
  IconX,
  IconPlus,
  IconLayoutColumns,
  IconLayoutRows,
  IconArrowMoveRight,
} from "@tabler/icons-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types/tab";

interface TabBarProps {
  paneId: string;
}

export function TabBar({ paneId }: TabBarProps) {
  const {
    panes,
    focusedPaneId,
    setActiveTab,
    createTab,
    createBrowserTab,
    createGitTab,
    closeTab,
    pinTab,
    dirtyTabs,
    splitPane,
    moveTabToPane,
  } = useAppContext();

  const pane = panes.find((p) => p.id === paneId);
  const paneTabs = pane?.tabs ?? [];
  const paneActiveTabId = pane?.activeTabId ?? null;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, tabId });
    },
    [],
  );

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
    }
  }

  const otherPaneId = panes.find((p) => p.id !== paneId)?.id;

  return (
    <div
      className={cn(
        "flex h-8 items-center border-b border-border bg-background shrink-0",
        paneId === focusedPaneId && panes.length > 1 && "border-t-2 border-t-primary/40",
      )}
    >
      <div className="flex flex-1 items-center overflow-x-auto">
        {paneTabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => {
              if (tab.type === "file" && tab.isTemporary) {
                pinTab(tab.id);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            role="tab"
            className={cn(
              "group flex items-center gap-1.5 px-2.5 h-8 text-xs shrink-0 transition-colors cursor-pointer select-none",
              paneActiveTabId === tab.id
                ? "text-foreground border-b-2 border-b-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {getTabIcon(tab)}
            <span
              className={cn(
                tab.type === "file" && tab.isTemporary && "italic",
              )}
            >
              {tab.title}
            </span>
            {dirtyTabs.has(tab.id) && (
              <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
            >
              <IconX size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="relative" ref={dropdownRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <IconPlus size={14} />
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
            <button
              onClick={() => {
                createTab();
                setDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <IconTerminal2 size={14} />
              New Terminal
            </button>
            <button
              onClick={() => {
                createBrowserTab();
                setDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <IconWorld size={14} />
              New Browser
            </button>
            <button
              onClick={() => {
                createGitTab();
                setDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <IconGitBranch size={14} />
              Git
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-48 rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {panes.length < 2 && (
            <>
              <button
                onClick={() => {
                  splitPane("horizontal", contextMenu.tabId);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <IconLayoutColumns size={14} />
                Split Right
              </button>
              <button
                onClick={() => {
                  splitPane("vertical", contextMenu.tabId);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <IconLayoutRows size={14} />
                Split Down
              </button>
            </>
          )}
          {panes.length === 2 && otherPaneId && (
            <button
              onClick={() => {
                moveTabToPane(contextMenu.tabId, otherPaneId);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <IconArrowMoveRight size={14} />
              Move to Other Pane
            </button>
          )}
          <button
            onClick={() => {
              closeTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            <IconX size={14} />
            Close
          </button>
        </div>
      )}
    </div>
  );
}
