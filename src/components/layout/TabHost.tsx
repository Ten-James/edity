import { useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useAllTabs, useLayoutStore } from "@/stores/layoutStore";
import { findLeafByPaneId } from "@/lib/paneTree";
import { usePaneSlot } from "@/hooks/usePaneSlot";
import {
  disposeTabHostDiv,
  getOrCreateTabHostDiv,
  moveTabHostDivToSlot,
  setTabHostDivActive,
} from "@/lib/paneSlots";
import { TerminalView } from "@/components/Terminal";
import { FileViewer } from "@/components/FileViewer";
import { BrowserView } from "@/components/BrowserView";
import { GitView } from "@/components/git/GitView";
import { ClaudeView } from "@/components/claude/ClaudeView";
import { DataView } from "@/components/data/DataView";
import { EventLogView } from "@/components/EventLogView";
import { RemoteAccessView } from "@/components/RemoteAccessView";
import type { AllTab } from "@/types/tab";

// Renders every tab in the app exactly once at a stable React tree position.
// Each tab's content is portaled into a per-tab "host" div that we create
// manually with document.createElement (so React never reparents it). The host
// div is then physically appended into the current pane's slot via appendChild.
//
// Because the React subtree for each tab never moves (the portal target is
// always the same host div), the tab components are NEVER unmounted when the
// user splits, unsplits, or moves a tab between panes. Terminal PTYs stay
// alive, Monaco editor state is preserved, scroll positions persist, etc.

export function TabHost() {
  const allTabs = useAllTabs();
  const projectPanes = useLayoutStore((s) => s.projectPanes);

  return (
    <>
      {allTabs.map((tab) => {
        const projectState = projectPanes.get(tab.projectId);
        const leaf = projectState
          ? findLeafByPaneId(projectState.root, tab.paneId)
          : null;
        const isActive = leaf?.pane.activeTabId === tab.id;
        return (
          <TabHostEntry
            key={tab.id}
            tab={tab}
            paneId={tab.paneId}
            isActive={isActive}
          />
        );
      })}
    </>
  );
}

interface TabHostEntryProps {
  tab: AllTab;
  paneId: string;
  isActive: boolean;
}

function TabHostEntry({ tab, paneId, isActive }: TabHostEntryProps) {
  // The host div lives in a module-level map keyed by tab.id, so it is
  // stable across re-renders without using React state or refs (which would
  // trip React Compiler's immutability rules). It is *not* React-managed —
  // React only writes the tab's children INTO it via the portal, and we are
  // free to re-parent it in the DOM without confusing React's reconciler.
  // Mutations of the host div live in helper functions in @/lib/paneSlots
  // so the React Compiler does not see direct DOM mutation here.
  const hostDiv = getOrCreateTabHostDiv(tab.id);

  const slot = usePaneSlot(paneId);

  // Move the host div into the current pane's slot whenever the slot value
  // changes. For *pane-split* commits the host div is already in the right
  // place because registerPaneSlot re-parents host divs atomically as each
  // new slot is attached. This effect still matters for the `layout-move-tab`
  // case: the destination pane's slot was already in the registry so
  // registerPaneSlot wasn't triggered, and only this effect carries the host
  // div over to the new parent.
  useLayoutEffect(() => {
    if (slot) moveTabHostDivToSlot(tab.id, slot);
  }, [slot, tab.id]);

  // Toggle visibility on the host div itself so inactive tabs don't capture
  // pointer events from siblings rendered into the same slot.
  useLayoutEffect(() => {
    setTabHostDivActive(tab.id, isActive);
  }, [tab.id, isActive]);

  // Final cleanup: when this tab is closed (TabHostEntry unmounts), dispose
  // the host div. We do NOT detach the host div on every effect re-run /
  // pane move — only on actual unmount — so React's portal can safely
  // removeChild its children from the still-existing host div.
  useEffect(() => {
    const tabId = tab.id;
    return () => {
      disposeTabHostDiv(tabId);
    };
  }, [tab.id]);

  return createPortal(renderTabContent(tab, isActive), hostDiv);
}

function renderTabContent(tab: AllTab, isActive: boolean) {
  switch (tab.type) {
    case "terminal":
      return (
        <TerminalView
          tabId={tab.id}
          isActive={isActive}
          cwd={tab.cwd ?? tab.projectPath}
          initialCommand={tab.initialCommand}
        />
      );
    case "file":
      return (
        <FileViewer
          tabId={tab.id}
          filePath={tab.filePath}
          isActive={isActive}
        />
      );
    case "browser":
      return (
        <BrowserView
          tabId={tab.id}
          isActive={isActive}
          initialUrl={tab.url}
        />
      );
    case "git":
      return (
        <GitView
          tabId={tab.id}
          isActive={isActive}
          projectPath={tab.projectPath}
        />
      );
    case "claude":
      return <ClaudeView isActive={isActive} projectPath={tab.projectPath} />;
    case "data":
      return (
        <DataView
          tabId={tab.id}
          isActive={isActive}
          projectId={tab.projectId}
          connectionId={tab.connectionId}
        />
      );
    case "event-log":
      return <EventLogView isActive={isActive} />;
    case "remote-access":
      return <RemoteAccessView isActive={isActive} />;
    default:
      return null;
  }
}
