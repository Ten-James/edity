import { useEffect, useRef, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useTheme } from "@/components/theme/ThemeProvider";
import { COMMANDS, type CommandContext } from "@/lib/commands";
import { eventToKeyCombo, matchKeybinding, resolveKeybindings } from "@/lib/keybindings";

function isEditorFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest(".monaco-editor") || el.closest(".xterm")) return true;
  return false;
}

export function useCommands() {
  const appCtx = useAppContext();
  const { toggleMode, settings } = useTheme();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const ctxRef = useRef<CommandContext>(null!);

  const {
    projects, activeProject, setActiveProject, addProject,
    tabs, activeTabId, createTab, closeTab, setActiveTab,
    openFileTab, createBrowserTab, createGitTab, createClaudeTab,
    splitPane, unsplit, panes, focusedPaneId, setFocusedPane,
    toggleSidebarPanel, sidebarPanel,
    runProject, stopProject, isProjectRunning,
  } = appCtx;

  const commandCtx: CommandContext = {
    projects, activeProject, setActiveProject, addProject,
    tabs, activeTabId, createTab, closeTab, setActiveTab,
    openFileTab, createBrowserTab, createGitTab, createClaudeTab,
    splitPane, unsplit, panes, focusedPaneId, setFocusedPane,
    toggleSidebarPanel, sidebarPanel,
    runProject, stopProject, isProjectRunning,
    openCommandPalette: () => setPaletteOpen(true),
    closeCommandPalette: () => setPaletteOpen(false),
    toggleTheme: toggleMode,
    openSettings: () => setSettingsOpen(true),
  };

  ctxRef.current = commandCtx;

  const keybindingsRef = useRef(resolveKeybindings(COMMANDS, settings.keybindings));

  useEffect(() => {
    keybindingsRef.current = resolveKeybindings(COMMANDS, settings.keybindings);
  }, [settings.keybindings]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const eventCombo = eventToKeyCombo(e);
      const editorFocused = isEditorFocused();

      for (const cmd of COMMANDS) {
        const binding = keybindingsRef.current.get(cmd.id);
        if (!binding) continue;
        if (!matchKeybinding(eventCombo, binding)) continue;

        if (editorFocused && !cmd.alwaysActive) continue;

        const ctx = ctxRef.current;
        if (cmd.when && !cmd.when(ctx)) continue;

        e.preventDefault();
        e.stopPropagation();
        cmd.execute(ctx);
        return;
      }
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  return {
    paletteOpen,
    setPaletteOpen,
    settingsOpen,
    setSettingsOpen,
    commandCtx: ctxRef,
  };
}
