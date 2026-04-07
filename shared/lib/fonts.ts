export const DEFAULT_UI_FONT_STACK = '"Inter Variable", sans-serif';
export const DEFAULT_MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function buildFontStack(
  family: string | null,
  fallback: string,
): string {
  if (!family) return fallback;
  const cleaned = family.replace(/"/g, "").trim();
  if (!cleaned) return fallback;
  return `"${cleaned}", ${fallback}`;
}
