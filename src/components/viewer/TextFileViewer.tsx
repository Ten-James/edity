import { useEffect, useState, useRef } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAppContext } from "@/contexts/AppContext";
import { getHighlighter, detectLang, ensureShikiTheme } from "@/lib/shiki";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconCopy } from "@tabler/icons-react";

interface TextFileViewerProps {
  content: string;
  filePath: string;
}

interface LineSelection {
  start: number;
  end: number;
}

export function TextFileViewer({ content, filePath }: TextFileViewerProps) {
  const { activeTheme } = useTheme();
  const { activeProject } = useAppContext();
  const [lines, setLines] = useState<string[]>([]);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const lastClickedLine = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Highlight with Shiki
  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      const highlighter = await getHighlighter();
      if (cancelled) return;

      const lang = detectLang(filePath);
      const shikiTheme = activeTheme.shikiTheme;
      await ensureShikiTheme(shikiTheme);

      // Load language if not already loaded
      const loadedLangs = highlighter.getLoadedLanguages();
      if (!loadedLangs.includes(lang as never) && lang !== "text") {
        try {
          await highlighter.loadLanguage(lang as never);
        } catch {
          // Fall back to text if language not available
        }
      }

      if (cancelled) return;

      const loadedLangsAfter = highlighter.getLoadedLanguages();
      const actualLang = loadedLangsAfter.includes(lang as never)
        ? lang
        : "text";

      const html = highlighter.codeToHtml(content, {
        lang: actualLang,
        theme: shikiTheme,
      });

      // Parse the HTML to extract individual lines
      // Shiki wraps each line in <span class="line">...</span>
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const lineElements = doc.querySelectorAll(".line");
      const lineHtmls = Array.from(lineElements).map((el) => el.innerHTML);
      if (!cancelled) setLines(lineHtmls);
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [content, filePath, activeTheme]);

  const getRelativePath = () => {
    if (activeProject) {
      const projectPath = activeProject.path;
      if (filePath.startsWith(projectPath)) {
        return filePath.slice(projectPath.length + 1);
      }
    }
    return filePath;
  };

  const handleLineClick = (lineNum: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedLine.current !== null) {
      const start = Math.min(lastClickedLine.current, lineNum);
      const end = Math.max(lastClickedLine.current, lineNum);
      setSelection({ start, end });
    } else {
      setSelection({ start: lineNum, end: lineNum });
      lastClickedLine.current = lineNum;
    }
  };

  const copyReference = async () => {
    if (!selection) return;
    const relativePath = getRelativePath();
    const ref =
      selection.start === selection.end
        ? `${relativePath}:${selection.start}`
        : `${relativePath}:${selection.start}-${selection.end}`;
    await navigator.clipboard.writeText(ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLineSelected = (lineNum: number) => {
    if (!selection) return false;
    return lineNum >= selection.start && lineNum <= selection.end;
  };

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative">
      {selection && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-2 border border-border bg-popover px-3 py-1.5 shadow-md text-xs">
          <span className="text-muted-foreground">
            {getRelativePath()}:
            {selection.start === selection.end
              ? selection.start
              : `${selection.start}-${selection.end}`}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={copyReference}
            className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
          >
            <IconCopy size={12} />
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div
          className="font-mono text-sm leading-6"
          onContextMenu={(e) => {
            if (selection) {
              e.preventDefault();
              copyReference();
            }
          }}
        >
          {lines.map((lineHtml, i) => {
            const lineNum = i + 1;
            return (
              <div
                key={i}
                className={`flex hover:bg-accent/30 transition-colors ${
                  isLineSelected(lineNum) ? "bg-primary/10" : ""
                }`}
              >
                <button
                  onClick={(e) => handleLineClick(lineNum, e)}
                  className="shrink-0 w-12 text-right pr-4 text-muted-foreground/50 select-none hover:text-muted-foreground cursor-pointer"
                >
                  {lineNum}
                </button>
                <span
                  className="flex-1 px-2 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: lineHtml }}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
