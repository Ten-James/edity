import type { SplitDirection } from "@/types/tab";
import type { RunCommand, EdityConfig } from "@shared/types/project";
import type { GlobalSettings } from "@shared/types/settings";

// ─── Project Events ─────────────────────────────────────────────

/** Switch the active project. */
export interface ProjectSwitchEvent {
  type: "project-switch";
  projectId: string;
}

/** Open OS dialog to add a new project folder. */
export interface ProjectAddEvent {
  type: "project-add";
}

/** Remove a project by ID. */
export interface ProjectRemoveEvent {
  type: "project-remove";
  projectId: string;
}

/** Reorder projects in the sidebar. */
export interface ProjectReorderEvent {
  type: "project-reorder";
  fromIndex: number;
  toIndex: number;
}

/** A project's .edity config was saved or reloaded. */
export interface ProjectConfigSavedEvent {
  type: "project-config-saved";
  projectId: string;
  config: EdityConfig;
}

// ─── Tab Events ─────────────────────────────────────────────────

/** Create a new terminal tab. */
export interface TabCreateTerminalEvent {
  type: "tab-create-terminal";
  initialCommand?: string;
}

/** Open a file in a tab (or focus existing). */
export interface TabOpenFileEvent {
  type: "tab-open-file";
  filePath: string;
}

/** Create a browser tab. */
export interface TabCreateBrowserEvent {
  type: "tab-create-browser";
  initialUrl?: string;
}

/** Open (or focus) the singleton Git tab. */
export interface TabCreateGitEvent {
  type: "tab-create-git";
}

/** Open (or focus) the singleton Claude tab. */
export interface TabCreateClaudeEvent {
  type: "tab-create-claude";
}

/** Close a tab by ID. */
export interface TabCloseEvent {
  type: "tab-close";
  tabId: string;
}

/** Close all tabs matching a file path or directory prefix. */
export interface TabCloseByFilePathEvent {
  type: "tab-close-by-filepath";
  filePath: string;
}

/** Set active tab in the pane that contains it. */
export interface TabSetActiveEvent {
  type: "tab-set-active";
  tabId: string;
}

/** Cycle to next tab in focused pane. */
export interface TabNextEvent {
  type: "tab-next";
}

/** Cycle to previous tab in focused pane. */
export interface TabPrevEvent {
  type: "tab-prev";
}

/** Pin a temporary file tab (make permanent). */
export interface TabPinEvent {
  type: "tab-pin";
  tabId: string;
}

/** Update tab title (e.g., terminal title from PTY). */
export interface TabUpdateTitleEvent {
  type: "tab-update-title";
  tabId: string;
  title: string;
}

/** Update browser tab URL. */
export interface TabUpdateBrowserUrlEvent {
  type: "tab-update-browser-url";
  tabId: string;
  url: string;
}

/** Mark a tab as dirty (unsaved) or clean. */
export interface TabSetDirtyEvent {
  type: "tab-set-dirty";
  tabId: string;
  dirty: boolean;
}

// ─── Layout / Pane Events ───────────────────────────────────────

/** Split the focused pane, optionally moving a specific tab. */
export interface LayoutSplitEvent {
  type: "layout-split";
  direction: SplitDirection;
  tabId?: string;
}

/** Merge all panes back to one. */
export interface LayoutUnsplitEvent {
  type: "layout-unsplit";
}

/** Move a tab to another pane. */
export interface LayoutMoveTabEvent {
  type: "layout-move-tab";
  tabId: string;
  targetPaneId: string;
}

/** Set the focused pane. */
export interface LayoutFocusPaneEvent {
  type: "layout-focus-pane";
  paneId: string;
}

/** Focus the other pane (toggle). */
export interface LayoutFocusOtherPaneEvent {
  type: "layout-focus-other-pane";
}

/** Toggle sidebar panel visibility. */
export interface LayoutToggleSidebarEvent {
  type: "layout-toggle-sidebar";
  panel: "files" | "git";
}

// ─── Settings Events ────────────────────────────────────────────

/** Partial settings update. */
export interface SettingsUpdateEvent {
  type: "settings-update";
  patch: Partial<GlobalSettings>;
}

/** Toggle light/dark mode. */
export interface SettingsToggleModeEvent {
  type: "settings-toggle-mode";
}

// ─── Git Events ─────────────────────────────────────────────────

/** Force-refresh git branch info and diff stats. */
export interface GitRefreshEvent {
  type: "git-refresh";
}

// ─── Run Events ─────────────────────────────────────────────────

/** Start running a project command. */
export interface RunStartEvent {
  type: "run-start";
  command?: RunCommand;
}

/** Stop a running command (or all if commandId omitted). */
export interface RunStopEvent {
  type: "run-stop";
  commandId?: string;
}

// ─── Claude Events ──────────────────────────────────────────────

/** External notification sound from main process. */
export interface ClaudeNotificationEvent {
  type: "claude-notification";
}

// ─── UI Events (transient, not stored) ──────────────────────────

/** Open the command palette. */
export interface UIOpenPaletteEvent {
  type: "ui-open-palette";
}

/** Close the command palette. */
export interface UIClosePaletteEvent {
  type: "ui-close-palette";
}

/** Open settings dialog. */
export interface UIOpenSettingsEvent {
  type: "ui-open-settings";
}

// ─── Union Type ─────────────────────────────────────────────────

export type EdityEvent =
  // Project
  | ProjectSwitchEvent
  | ProjectAddEvent
  | ProjectRemoveEvent
  | ProjectReorderEvent
  | ProjectConfigSavedEvent
  // Tab
  | TabCreateTerminalEvent
  | TabOpenFileEvent
  | TabCreateBrowserEvent
  | TabCreateGitEvent
  | TabCreateClaudeEvent
  | TabCloseEvent
  | TabCloseByFilePathEvent
  | TabSetActiveEvent
  | TabNextEvent
  | TabPrevEvent
  | TabPinEvent
  | TabUpdateTitleEvent
  | TabUpdateBrowserUrlEvent
  | TabSetDirtyEvent
  // Layout
  | LayoutSplitEvent
  | LayoutUnsplitEvent
  | LayoutMoveTabEvent
  | LayoutFocusPaneEvent
  | LayoutFocusOtherPaneEvent
  | LayoutToggleSidebarEvent
  // Settings
  | SettingsUpdateEvent
  | SettingsToggleModeEvent
  // Git
  | GitRefreshEvent
  // Run
  | RunStartEvent
  | RunStopEvent
  // Claude
  | ClaudeNotificationEvent
  // UI
  | UIOpenPaletteEvent
  | UIClosePaletteEvent
  | UIOpenSettingsEvent;

/** Extract the event interface for a specific event type string. */
export type EventPayload<T extends EdityEvent["type"]> = Extract<EdityEvent, { type: T }>;
