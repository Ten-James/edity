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

export type Tab = TerminalTab | FileTab | BrowserTab | GitTab | ClaudeTab;

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
