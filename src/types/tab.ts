interface BaseTab {
  id: string;
  title: string;
}

export interface TerminalTab extends BaseTab {
  type: "terminal";
  initialCommand?: string;
  cwd?: string;
  worktreeBranch?: string;
}

export interface FileTab extends BaseTab {
  type: "file";
  filePath: string;
  isTemporary: boolean;
}

export interface BrowserTab extends BaseTab {
  type: "browser";
  url: string;
}

export interface GitTab extends BaseTab {
  type: "git";
}

export interface ClaudeTab extends BaseTab {
  type: "claude";
}

export interface DataTab extends BaseTab {
  type: "data";
  connectionId?: string;
}

export interface EventLogTab extends BaseTab {
  type: "event-log";
}

export interface RemoteAccessTab extends BaseTab {
  type: "remote-access";
}

export type Tab =
  | TerminalTab
  | FileTab
  | BrowserTab
  | GitTab
  | ClaudeTab
  | DataTab
  | EventLogTab
  | RemoteAccessTab;

export type SplitDirection = "horizontal" | "vertical";

export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

/**
 * Recursive layout tree. A `leaf` is a single Pane with tabs; a `split`
 * arranges its two children either horizontally or vertically and can be
 * nested arbitrarily, so any pane can be split in half by drag-and-drop
 * regardless of how deeply nested it already is.
 */
export type LayoutNode = LeafNode | SplitNode;

export interface LeafNode {
  type: "leaf";
  pane: Pane;
}

export interface SplitNode {
  type: "split";
  id: string;
  orientation: SplitDirection;
  children: [LayoutNode, LayoutNode];
}

export interface ProjectPaneState {
  root: LayoutNode;
  focusedPaneId: string;
}

/** Drop zone within a pane — center moves the tab in, edges split. */
export type DropZone = "center" | "top" | "right" | "bottom" | "left";

export type AllTab = Tab & {
  projectId: string;
  projectPath: string;
  paneId: string;
};
