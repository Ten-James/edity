import { ipcMain } from "electron";
import * as fs from "fs";
import { CONFIG_DIR, SETTINGS_PATH } from "../lib/state";
import { DEFAULT_SETTINGS } from "../../../shared/types/settings";
import type { GlobalSettings } from "../../../shared/types/settings";

function loadSettings(): GlobalSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: GlobalSettings): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function registerSettingsHandlers(): void {
  ipcMain.handle("get_settings", () => loadSettings());

  ipcMain.handle("save_settings", (_event, { settings }: { settings: GlobalSettings }) => {
    saveSettings(settings);
  });
}
