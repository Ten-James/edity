import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseDiff } from "@/lib/diff-parser";
import { cn } from "@/lib/utils";

interface GitDiffViewerProps {
  diff: string | null;
  filePath: string | null;
}

export function GitDiffViewer({ diff, filePath }: GitDiffViewerProps) {
  const parsed = useMemo(() => {
    if (!diff || !filePath) return null;
    return parseDiff(diff, filePath);
  }, [diff, filePath]);

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

  return (
    <ScrollArea className="h-full">
      <div className="p-2 font-mono text-xs leading-5">
        {parsed?.hunks.map((hunk, hi) => (
          <div key={hi} className="mb-2">
            {hunk.lines.map((line, li) => (
              <div
                key={li}
                className={cn(
                  "flex",
                  line.type === "add" && "bg-green-500/10 text-green-400",
                  line.type === "remove" && "bg-red-500/10 text-red-400",
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
                <span className="w-4 shrink-0 select-none">
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                      ? "-"
                      : line.type === "header"
                        ? ""
                        : " "}
                </span>
                <span className="whitespace-pre">{line.content}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
