import type { ColorTheme } from "@shared/types/settings";
import { edityLight, edityDark } from "./edity";
import { catppuccinLatte, catppuccinFrappe, catppuccinMacchiato, catppuccinMocha } from "./catppuccin";
import { rosePine, rosePineMoon, rosePineDawn } from "./rose-pine";
import {
  tokyoNight, tokyoNightStorm, dracula, nord,
  gruvboxDark, gruvboxLight, oneDarkPro,
  solarizedDark, solarizedLight, githubDark, githubLight,
} from "./others";

export const THEMES: ColorTheme[] = [
  edityLight,
  edityDark,
  catppuccinLatte,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinMocha,
  rosePineDawn,
  rosePine,
  rosePineMoon,
  tokyoNight,
  tokyoNightStorm,
  dracula,
  nord,
  gruvboxLight,
  gruvboxDark,
  oneDarkPro,
  solarizedLight,
  solarizedDark,
  githubLight,
  githubDark,
];

export const LIGHT_THEMES = THEMES.filter((t) => t.type === "light");
export const DARK_THEMES = THEMES.filter((t) => t.type === "dark");

export function getThemeById(id: string): ColorTheme | undefined {
  return THEMES.find((t) => t.id === id);
}
