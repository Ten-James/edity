import type { Command } from "./commands";

export interface KeyCombo {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  key: string;
}

export const isMac = navigator.platform.startsWith("Mac");

export function parseKeybinding(str: string): KeyCombo {
  const parts = str.split("+");
  const combo: KeyCombo = { mod: false, shift: false, alt: false, ctrl: false, key: "" };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mod") combo.mod = true;
    else if (lower === "shift") combo.shift = true;
    else if (lower === "alt") combo.alt = true;
    else if (lower === "ctrl") combo.ctrl = true;
    else combo.key = part.toLowerCase();
  }

  return combo;
}

export function eventToKeyCombo(e: KeyboardEvent): KeyCombo {
  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  if (key === "escape") key = "escape";

  return {
    mod: isMac ? e.metaKey : e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    ctrl: isMac ? e.ctrlKey : false,
    key,
  };
}

export function matchKeybinding(event: KeyCombo, binding: KeyCombo): boolean {
  return (
    event.mod === binding.mod &&
    event.shift === binding.shift &&
    event.alt === binding.alt &&
    event.ctrl === binding.ctrl &&
    event.key === binding.key
  );
}

export function formatKeybinding(str: string): string {
  const parts = str.split("+");
  const formatted: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mod") {
      formatted.push(isMac ? "\u2318" : "Ctrl");
    } else if (lower === "shift") {
      formatted.push(isMac ? "\u21E7" : "Shift");
    } else if (lower === "alt") {
      formatted.push(isMac ? "\u2325" : "Alt");
    } else if (lower === "ctrl") {
      formatted.push(isMac ? "\u2303" : "Ctrl");
    } else if (lower === "tab") {
      formatted.push(isMac ? "\u21E5" : "Tab");
    } else if (lower === "\\") {
      formatted.push("\\");
    } else {
      formatted.push(part.toUpperCase());
    }
  }

  return formatted.join(isMac ? "" : "+");
}

const MODIFIER_KEYS = new Set([
  "shift", "control", "alt", "meta", "capslock", "fn",
]);

export function eventToKeybindingString(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return null;

  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (!isMac && e.ctrlKey && parts[0] !== "Mod") parts.push("Ctrl");
  if (isMac && e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  if (key === " ") parts.push("Space");
  else if (key === "tab") parts.push("Tab");
  else if (key.length === 1) parts.push(key);
  else parts.push(key.charAt(0).toUpperCase() + key.slice(1));

  return parts.join("+");
}

export function getEffectiveKeybinding(
  cmd: Command,
  userOverrides: Record<string, string>,
): string | undefined {
  const override = userOverrides[cmd.id];
  if (override !== undefined) return override || undefined;
  return cmd.defaultKeybinding;
}

export function resolveKeybindings(
  commands: Command[],
  userOverrides: Record<string, string>,
): Map<string, KeyCombo> {
  const map = new Map<string, KeyCombo>();

  for (const cmd of commands) {
    const bindingStr = getEffectiveKeybinding(cmd, userOverrides);
    if (bindingStr) {
      map.set(cmd.id, parseKeybinding(bindingStr));
    }
  }

  return map;
}
