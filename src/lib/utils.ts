import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PROJECT_COLORS: Record<string, { hex: string; textHex: string }> = {
  red:    { hex: "#dc2626", textHex: "#fff" },
  orange: { hex: "#f97316", textHex: "#fff" },
  yellow: { hex: "#eab308", textHex: "#000" },
  green:  { hex: "#16a34a", textHex: "#fff" },
  blue:   { hex: "#2563eb", textHex: "#fff" },
  purple: { hex: "#9333ea", textHex: "#fff" },
  pink:   { hex: "#ec4899", textHex: "#fff" },
  gray:   { hex: "#6b7280", textHex: "#fff" },
};

export const COLOR_KEYS = Object.keys(PROJECT_COLORS);
