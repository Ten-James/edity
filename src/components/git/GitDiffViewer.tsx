import {
  useState,
  useEffect,
  useMemo,
  Component,
  type ReactNode,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseDiff } from "@/lib/diff-parser";
import { getHighlighter, detectLang, ensureShikiTheme } from "@/lib/shiki";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import type { DiffLine, FileDiff } from "@/types/git";
import type { Highlighter } from "shiki";

// Above this many lines we skip shiki tokenization entirely — it would block
// the main thread for too long. The diff still renders, just without syntax
// colors. Below this we highlight normally.
const MAX_HIGHLIGHT_LINES = 2000;
// Above this we show a placeholder instead of rendering all rows. The user
// can still force-render via the button if they really want to scroll it.
const MAX_RENDER_LINES = 10000;

interface GitDiffViewerProps {
  diff: string | null;
  filePath: string | null;
}

interface TokenSpan {
  content: string;
  color?: string;
}

function tokenizeLine(
  line: DiffLine,
  lineIndex: number,
  tokenMap: Map<number, TokenSpan[]> | null,
): TokenSpan[] {
  if (!tokenMap) return [{ content: line.content }];
  return tokenMap.get(lineIndex) ?? [{ content: line.content }];
}

interface TokenCache {
  map: Map<number, TokenSpan[]>;
  // Stored inputs so the render path can tell whether `map` still belongs
  // to the currently-requested (code, lang, theme) combo. Using derived-
  // state comparison instead of clearing state in an effect avoids the
  // React "setState in effect" anti-pattern.
  code: string;
  lang: string;
  theme: string;
}

function useShikiTokens(
  lines: DiffLine[] | null,
  code: string | null,
  lang: string | null,
  shikiTheme: string,
) {
  const [cache, setCache] = useState<TokenCache | null>(null);

  const canHighlight = !!(
    code &&
    lines &&
    lang &&
    lang !== "text" &&
    lines.length <= MAX_HIGHLIGHT_LINES
  );

  useEffect(() => {
    if (!canHighlight) return;

    let cancelled = false;

    (async () => {
      await ensureShikiTheme(shikiTheme);
      const highlighter: Highlighter = await getHighlighter();
      if (cancelled) return;
      try {
        const result = highlighter.codeToTokens(code, {
          lang: lang as Parameters<Highlighter["codeToTokens"]>[1]["lang"],
          theme: shikiTheme,
        });
        const map = new Map<number, TokenSpan[]>();

        let shikiLineIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].type === "header") continue;
          const shikiLine = result.tokens[shikiLineIdx];
          if (shikiLine) {
            map.set(
              i,
              shikiLine.map((t) => ({ content: t.content, color: t.color })),
            );
          }
          shikiLineIdx++;
        }

        if (!cancelled) {
          setCache({ map, code, lang, theme: shikiTheme });
        }
      } catch {
        /* highlighting failed — derived tokenMap stays null */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canHighlight, code, lang, shikiTheme, lines]);

  if (
    !canHighlight ||
    !cache ||
    cache.code !== code ||
    cache.lang !== lang ||
    cache.theme !== shikiTheme
  ) {
    return null;
  }
  return cache.map;
}

interface ErrorBoundaryProps {
  filePath: string | null;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class DiffErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.filePath !== this.props.filePath && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
          <span className="text-destructive font-medium">Diff render failed</span>
          <span className="font-mono text-[10px] max-w-md text-center break-all">
            {this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GitDiffViewer({ diff, filePath }: GitDiffViewerProps) {
  return (
    <DiffErrorBoundary filePath={filePath}>
      <GitDiffViewerInner diff={diff} filePath={filePath} />
    </DiffErrorBoundary>
  );
}

function GitDiffViewerInner({ diff, filePath }: GitDiffViewerProps) {
  const { activeTheme } = useTheme();
  // Track which file the user explicitly opted into rendering. Storing the
  // filePath (instead of a boolean) auto-resets the opt-in when the user
  // navigates to a different file, without needing an effect to clear it.
  const [forceRenderFile, setForceRenderFile] = useState<string | null>(null);
  const forceRender = forceRenderFile !== null && forceRenderFile === filePath;

  // Memoize all derived values so they only recompute when inputs actually
  // change. Without this, parseDiff + flatMap + code-join run on every
  // render, and the shiki effect re-fires on every render because `lines`
  // and `code` are new references each time — that's the freeze.
  const parsed = useMemo<FileDiff | null>(
    () => (diff && filePath ? parseDiff(diff, filePath) : null),
    [diff, filePath],
  );
  const allLines = useMemo(
    () => (parsed ? parsed.hunks.flatMap((h) => h.lines) : null),
    [parsed],
  );
  const code = useMemo(
    () =>
      allLines
        ? allLines
            .filter((l) => l.type !== "header")
            .map((l) => l.content)
            .join("\n")
        : null,
    [allLines],
  );
  const lang = useMemo(
    () => (filePath ? detectLang(filePath) : null),
    [filePath],
  );
  const hunkOffsets = useMemo(() => {
    if (!parsed) return [];
    const offsets: number[] = [];
    let offset = 0;
    for (const hunk of parsed.hunks) {
      offsets.push(offset);
      offset += hunk.lines.length;
    }
    return offsets;
  }, [parsed]);

  const tokenMap = useShikiTokens(allLines, code, lang, activeTheme.shikiTheme);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a file to view its diff
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No changes to display
      </div>
    );
  }

  if (parsed?.isBinary) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Binary file changed
      </div>
    );
  }

  const lineCount = allLines?.length ?? 0;
  if (lineCount > MAX_RENDER_LINES && !forceRender) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-xs text-muted-foreground">
        <span>
          Diff too large to render ({lineCount.toLocaleString()} lines).
        </span>
        <button
          type="button"
          onClick={() => setForceRenderFile(filePath)}
          className="border border-border bg-input/30 px-3 py-1 hover:bg-accent"
        >
          Render anyway
        </button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 font-mono text-xs leading-5">
        {parsed?.hunks.map((hunk, hi) => (
          <div key={hi} className="mb-2">
            {hunk.lines.map((line, li) => {
              const idx = hunkOffsets[hi] + li;
              const tokens = tokenizeLine(line, idx, tokenMap);

              return (
                <div
                  key={li}
                  className={cn(
                    "flex",
                    line.type === "add" && "bg-green-500/10",
                    line.type === "remove" && "bg-red-500/10",
                    line.type === "header" &&
                      "text-muted-foreground bg-muted/30 mt-1 mb-0.5",
                    line.type === "context" && "text-muted-foreground",
                  )}
                >
                  <span className="w-8 shrink-0 text-right pr-2 select-none text-muted-foreground/50">
                    {line.oldLineNum ?? ""}
                  </span>
                  <span className="w-8 shrink-0 text-right pr-2 select-none text-muted-foreground/50">
                    {line.newLineNum ?? ""}
                  </span>
                  <span
                    className={cn(
                      "w-4 shrink-0 select-none",
                      line.type === "add" && "text-green-400",
                      line.type === "remove" && "text-red-400",
                    )}
                  >
                    {line.type === "add"
                      ? "+"
                      : line.type === "remove"
                        ? "-"
                        : line.type === "header"
                          ? ""
                          : " "}
                  </span>
                  <span className="whitespace-pre">
                    {line.type === "header"
                      ? line.content
                      : tokens.map((token, ti) => (
                          <span
                            key={ti}
                            style={
                              token.color ? { color: token.color } : undefined
                            }
                          >
                            {token.content}
                          </span>
                        ))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
