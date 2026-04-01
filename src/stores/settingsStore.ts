import { create } from "zustand";
import { subscribe } from "./eventBus";
import { invoke } from "@/lib/ipc";
import {
  DEFAULT_SETTINGS,
  type GlobalSettings,
  type ColorTheme,
  type ThemeCssVars,
} from "@shared/types/settings";
import { getThemeById } from "@/lib/themes";

type Mode = "light" | "dark";

interface SettingsState {
  mode: Mode;
  settings: GlobalSettings;
  activeTheme: ColorTheme;

  _applyPatch: (patch: Partial<GlobalSettings>) => void;
  _toggleMode: () => void;
  _loadFromDisk: () => Promise<void>;
}

function resolveTheme(mode: Mode, settings: GlobalSettings): ColorTheme {
  const id = mode === "light" ? settings.lightTheme : settings.darkTheme;
  return (
    getThemeById(id) ??
    getThemeById(mode === "light" ? "edity-light" : "edity-dark")!
  );
}

function loadCachedSettings(): GlobalSettings {
  try {
    const cached = localStorage.getItem("edity-settings");
    if (cached) return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

function loadCachedMode(): Mode {
  return (localStorage.getItem("edity-theme") as Mode) ?? "dark";
}

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
    el.style.setProperty(
      cssVar,
      value ?? (key === "radius" ? DEFAULT_RADIUS : ""),
    );
  }
}

function applyMode(mode: Mode) {
  const html = document.documentElement;
  if (mode === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
}

const initialMode = loadCachedMode();
const initialSettings = loadCachedSettings();
const initialTheme = resolveTheme(initialMode, initialSettings);

// Apply immediately to prevent flash
applyMode(initialMode);
applyThemeCssVars(initialTheme.cssVars);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  mode: initialMode,
  settings: initialSettings,
  activeTheme: initialTheme,

  _applyPatch: (patch) => {
    const next = { ...get().settings, ...patch };
    localStorage.setItem("edity-settings", JSON.stringify(next));
    invoke("save_settings", { settings: next }).catch(() => {});
    const theme = resolveTheme(get().mode, next);
    applyThemeCssVars(theme.cssVars);
    set({ settings: next, activeTheme: theme });
  },

  _toggleMode: () => {
    const nextMode: Mode = get().mode === "dark" ? "light" : "dark";
    localStorage.setItem("edity-theme", nextMode);
    applyMode(nextMode);
    const theme = resolveTheme(nextMode, get().settings);
    applyThemeCssVars(theme.cssVars);
    set({ mode: nextMode, activeTheme: theme });
  },

  _loadFromDisk: async () => {
    try {
      const s = await invoke<GlobalSettings>("get_settings");
      localStorage.setItem("edity-settings", JSON.stringify(s));
      const merged = { ...DEFAULT_SETTINGS, ...s };
      const theme = resolveTheme(get().mode, merged);
      applyThemeCssVars(theme.cssVars);
      set({ settings: merged, activeTheme: theme });
    } catch {
      /* ignore */
    }
  },
}));

// Subscribe to events
subscribe((event) => {
  const store = useSettingsStore.getState();
  switch (event.type) {
    case "settings-update":
      store._applyPatch(event.patch);
      break;
    case "settings-toggle-mode":
      store._toggleMode();
      break;
  }
});
