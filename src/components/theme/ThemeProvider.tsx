import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type GlobalSettings, type ColorTheme, type ThemeCssVars } from "@shared/types/settings";
import { getThemeById } from "@/lib/themes";
import { invoke } from "@/lib/ipc";

type Mode = "light" | "dark";

interface ThemeContextValue {
  /** Current light/dark mode */
  mode: Mode;
  toggleMode: () => void;
  /** Resolved theme for the current mode */
  activeTheme: ColorTheme;
  /** Global app settings */
  settings: GlobalSettings;
  /** Persist a partial settings update */
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<void>;
  // Backward-compat aliases
  theme: Mode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const CSS_VAR_MAP: Record<keyof ThemeCssVars, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  radius: "--radius",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
};

const DEFAULT_RADIUS = "0.625rem";

function applyThemeCssVars(vars: ThemeCssVars) {
  const el = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = vars[key as keyof ThemeCssVars];
    el.style.setProperty(cssVar, value ?? (key === "radius" ? DEFAULT_RADIUS : ""));
  }
}

function resolveTheme(mode: Mode, settings: GlobalSettings): ColorTheme {
  const id = mode === "light" ? settings.lightTheme : settings.darkTheme;
  return getThemeById(id) ?? getThemeById(mode === "light" ? "edity-light" : "edity-dark")!;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    return (localStorage.getItem("edity-theme") as Mode) ?? "dark";
  });

  const [settings, setSettings] = useState<GlobalSettings>(() => {
    // Try to restore cached settings from localStorage for flash prevention
    try {
      const cached = localStorage.getItem("edity-settings");
      if (cached) return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  });

  // Load settings from disk on mount
  useEffect(() => {
    invoke<GlobalSettings>("get_settings").then((s) => {
      setSettings(s);
      localStorage.setItem("edity-settings", JSON.stringify(s));
    }).catch(() => {});
  }, []);

  const activeTheme = resolveTheme(mode, settings);

  // Apply dark class + CSS variables whenever mode or theme changes
  useEffect(() => {
    const html = document.documentElement;
    if (mode === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("edity-theme", mode);
    applyThemeCssVars(activeTheme.cssVars);
  }, [mode, activeTheme]);

  const toggleMode = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);

  const updateSettings = useCallback(async (patch: Partial<GlobalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("edity-settings", JSON.stringify(next));
      invoke("save_settings", { settings: next }).catch(() => {});
      return next;
    });
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
