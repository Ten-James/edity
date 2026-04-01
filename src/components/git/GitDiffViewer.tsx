import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseDiff } from "@/lib/diff-parser";
import { getHighlighter, detectLang, ensureShikiTheme } from "@/lib/shiki";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import type { DiffLine } from "@/types/git";
import type { Highlighter } from "shiki";

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

function useShikiTokens(
  lines: DiffLine[] | null,
  filePath: string | null,
  shikiTheme: string,
) {
  const [tokenMap, setTokenMap] = useState<Map<number, TokenSpan[]> | null>(
    null,
  );

  const code = lines
    ? lines
        .filter((l) => l.type !== "header")
        .map((l) => l.content)
        .join("\n")
    : null;

  useEffect(() => {
    if (!code || !filePath) {
      setTokenMap(null);
      return;
    }

    const lang = detectLang(filePath);
    if (lang === "text") {
      setTokenMap(null);
      return;
    }

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
        if (lines) {
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
        }

        if (!cancelled) setTokenMap(map);
      } catch {
        if (!cancelled) setTokenMap(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, filePath, lines, shikiTheme]);

  return tokenMap;
}

export function GitDiffViewer({ diff, filePath }: GitDiffViewerProps) {
  const { activeTheme } = useTheme();

  const parsed = diff && filePath ? parseDiff(diff, filePath) : null;
  const allLines = parsed ? parsed.hunks.flatMap((h) => h.lines) : null;

  const tokenMap = useShikiTokens(allLines, filePath, activeTheme.shikiTheme);

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

  let globalLineIdx = 0;

  return (
    <ScrollArea className="h-full">
      <div className="p-2 font-mono text-xs leading-5">
        {parsed?.hunks.map((hunk, hi) => (
          <div key={hi} className="mb-2">
            {hunk.lines.map((line, li) => {
              const idx = globalLineIdx++;
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
