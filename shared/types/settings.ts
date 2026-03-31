export interface ClaudeSettings {
  showChatAvatars: boolean;
  autoExpandTools: string[];
}

export interface GlobalSettings {
  lightTheme: string;
  darkTheme: string;
  defaultProjectId: string | null;
  claude: ClaudeSettings;
  keybindings: Record<string, string>;
}

export interface ThemeCssVars {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  radius?: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

export interface MonacoThemeColors {
  bg: string;
  fg: string;
  card: string;
  muted: string;
  mutedFg: string;
  accent: string;
  primary: string;
}

export interface TerminalThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface ColorTheme {
  id: string;
  name: string;
  type: "light" | "dark";
  cssVars: ThemeCssVars;
  monaco: MonacoThemeColors;
  terminal: TerminalThemeColors;
  shikiTheme: string;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  lightTheme: "edity-light",
  darkTheme: "edity-dark",
  defaultProjectId: null,
  claude: {
    showChatAvatars: true,
    autoExpandTools: ["Edit", "Bash"],
  },
  keybindings: {},
};
