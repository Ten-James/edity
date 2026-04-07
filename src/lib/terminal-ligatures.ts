// Common programming ligature sequences supported by popular monospace fonts
// (Fira Code, JetBrains Mono, Cascadia Code, Iosevka, Hack, etc.). xterm.js
// can only render ligatures via the canvas/WebGL renderer plus a character
// joiner that tells the renderer which character ranges should be drawn as a
// single glyph — the font's OpenType ligature table then takes over.
//
// We don't parse the user's font file (the official @xterm/addon-ligatures
// does, but it depends on Node `fs` and won't run in a sandboxed Electron
// renderer), so this is a curated superset. Sequences that the active font
// doesn't support fall through harmlessly: the joiner groups them, but the
// font draws each glyph individually.
//
// Order matters — longest first so `===` matches before `==`.
const LIGATURE_SEQUENCES: readonly string[] = [
  // 4-char
  "<==>",
  "<--",
  "-->",
  "<<=",
  ">>=",
  "<<<",
  ">>>",
  // 3-char
  "===",
  "!==",
  "<=>",
  "<->",
  "...",
  ":::",
  "<<-",
  "->>",
  "<|>",
  "<$>",
  "<+>",
  "<*>",
  "</>",
  "<~>",
  // 2-char
  "==",
  "!=",
  "<=",
  ">=",
  "=>",
  "->",
  "<-",
  "||",
  "&&",
  "++",
  "--",
  "**",
  "//",
  "/*",
  "*/",
  "::",
  "..",
  "??",
  "?.",
  "?:",
  "<|",
  "|>",
  "<>",
  "<<",
  ">>",
  "<$",
  "$>",
  ":=",
  "~=",
  "<~",
  "~>",
  "|=",
  "&=",
  "^=",
  "%=",
  "+=",
  "-=",
  "*=",
  "/=",
  "##",
  "://",
] as const;

/**
 * Character joiner for xterm.js: returns [start, endExclusive] index ranges
 * within a single row's text that should be rendered as a unit so the font's
 * native ligature substitution can apply.
 */
export function findLigatureRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const seq of LIGATURE_SEQUENCES) {
      if (text.startsWith(seq, i)) {
        ranges.push([i, i + seq.length]);
        i += seq.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return ranges;
}
