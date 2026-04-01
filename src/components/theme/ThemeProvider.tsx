import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { dispatch } from "@/stores/eventBus";
import type { GlobalSettings, ColorTheme } from "@shared/types/settings";

type Mode = "light" | "dark";

interface ThemeContextValue {
  mode: Mode;
  toggleMode: () => void;
  activeTheme: ColorTheme;
  settings: GlobalSettings;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<void>;
  theme: Mode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSettingsStore((s) => s.mode);
  const settings = useSettingsStore((s) => s.settings);
  const activeTheme = useSettingsStore((s) => s.activeTheme);

  const toggleMode = useCallback(() => {
    dispatch({ type: "settings-toggle-mode" });
  }, []);

  const updateSettings = useCallback(async (patch: Partial<GlobalSettings>) => {
    dispatch({ type: "settings-update", patch });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        toggleMode,
        activeTheme,
        settings,
        updateSettings,
        theme: mode,
        toggleTheme: toggleMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
