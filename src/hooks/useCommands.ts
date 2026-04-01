import { useEffect, useRef, useState } from "react";
import { subscribe } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";
import { COMMANDS } from "@/lib/commands";
import {
  eventToKeyCombo,
  matchKeybinding,
  resolveKeybindings,
} from "@/lib/keybindings";

function isEditorFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest(".monaco-editor") || el.closest(".xterm")) return true;
  return false;
}

export function useCommands() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const keybindings = useSettingsStore((s) => s.settings.keybindings);
  const keybindingsRef = useRef(resolveKeybindings(COMMANDS, keybindings));

  useEffect(() => {
    keybindingsRef.current = resolveKeybindings(COMMANDS, keybindings);
  }, [keybindings]);

  // Listen for UI events from the bus
  useEffect(() => {
    return subscribe((event) => {
      switch (event.type) {
        case "ui-open-palette":
          setPaletteOpen(true);
          break;
        case "ui-close-palette":
          setPaletteOpen(false);
          break;
        case "ui-open-settings":
          setSettingsOpen(true);
          break;
      }
    });
  }, []);

  // Global keydown handler
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const eventCombo = eventToKeyCombo(e);
      const editorFocused = isEditorFocused();

      for (const cmd of COMMANDS) {
        const binding = keybindingsRef.current.get(cmd.id);
        if (!binding) continue;
        if (!matchKeybinding(eventCombo, binding)) continue;
        if (editorFocused && !cmd.alwaysActive) continue;
        if (cmd.when && !cmd.when()) continue;

        e.preventDefault();
        e.stopPropagation();
        cmd.execute();
        return;
      }
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  return { paletteOpen, setPaletteOpen, settingsOpen, setSettingsOpen };
}
