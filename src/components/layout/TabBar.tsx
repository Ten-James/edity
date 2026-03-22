import {
  IconTerminal2,
  IconFile,
  IconWorld,
  IconGitBranch,
  IconX,
  IconPlus,
} from "@tabler/icons-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

export function TabBar() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    createTab,
    createBrowserTab,
    createGitTab,
    closeTab,
    pinTab,
  } = useAppContext();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  function getTabIcon(tab: (typeof tabs)[number]) {
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

  return (
    <div className="flex h-9 items-center border-b border-border bg-card shrink-0">
      <div className="flex flex-1 items-center overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => {
              if (tab.type === "file" && tab.isTemporary) {
                pinTab(tab.id);
              }
            }}
            role="tab"
            className={cn(
              "group flex items-center gap-1.5 px-3 h-9 text-xs border-r border-border shrink-0 transition-colors cursor-pointer select-none",
              activeTabId === tab.id
                ? "bg-background text-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
            >
              <IconX size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="relative" ref={dropdownRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
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
    </div>
  );
}
