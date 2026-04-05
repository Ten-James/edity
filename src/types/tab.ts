interface BaseTab {
  id: string;
  title: string;
}

export interface TerminalTab extends BaseTab {
  type: "terminal";
  initialCommand?: string;
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

export type Tab =
  | TerminalTab
  | FileTab
  | BrowserTab
  | GitTab
  | ClaudeTab
  | DataTab
  | EventLogTab;

export type SplitDirection = "horizontal" | "vertical";

export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

export interface ProjectPaneState {
  panes: Pane[];
  focusedPaneId: string;
  splitDirection: SplitDirection;
}

export type AllTab = Tab & {
  projectId: string;
  projectPath: string;
  paneId: string;
};
