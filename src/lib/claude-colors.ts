import type { ClaudeStatus } from "@/stores/claudeStore";

/**
 * Hex colors used to tint a Claude terminal's background. Mirrors the
 * sidebar status dot colors in src/components/layout/Sidebar.tsx
 * (Tailwind v3 blue-500 / green-500 / red-500 hex values).
 */
export const CLAUDE_STATUS_HEX: Record<
  Exclude<ClaudeStatus, null>,
  string
> = {
  working: "#3b82f6",
  active: "#3b82f6",
  idle: "#22c55e",
  notification: "#ef4444",
};

/** Strength of the status overlay blended over the terminal background (0–1). */
export const CLAUDE_STATUS_MIX_ALPHA = 0.22;

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/**
 * Linear blend: `alpha` of `overlay` laid over `bg`. Returns a solid hex
 * string (xterm's theme.background expects an opaque color). Falls back
 * to `bg` unchanged if either input fails to parse.
 */
export function mixHex(bg: string, overlay: string, alpha: number): string {
  const a = parseHex(bg);
  const b = parseHex(overlay);
  if (!a || !b) return bg;
  const k = Math.max(0, Math.min(1, alpha));
  return toHex(
    a[0] * (1 - k) + b[0] * k,
    a[1] * (1 - k) + b[1] * k,
    a[2] * (1 - k) + b[2] * k,
  );
}

/**
 * Compute the background color for a Claude-aware terminal. Returns the
 * unchanged `bg` when the status is null (not a Claude tab) so callers can
 * use it unconditionally.
 */
export function claudeTintedBackground(
  bg: string,
  status: ClaudeStatus,
): string {
  if (!status) return bg;
  return mixHex(bg, CLAUDE_STATUS_HEX[status], CLAUDE_STATUS_MIX_ALPHA);
}
