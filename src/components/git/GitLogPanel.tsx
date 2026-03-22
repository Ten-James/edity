import { useEffect } from "react";
import { IconGitCommit } from "@tabler/icons-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { GitLogEntry } from "@/types/git";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface GitLogPanelProps {
  log: GitLogEntry[];
  onLoadLog: (count?: number, skip?: number) => Promise<void>;
}

export function GitLogPanel({ log, onLoadLog }: GitLogPanelProps) {
  useEffect(() => {
    onLoadLog();
  }, [onLoadLog]);

  return (
    <ScrollArea className="h-full">
      <div className="p-1">
        {log.map((entry) => (
          <div
            key={entry.hash}
            className="flex items-start gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
          >
            <IconGitCommit
              size={14}
              className="shrink-0 mt-0.5 text-muted-foreground"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {entry.shortHash}
                </span>
                {entry.refs && (
                  <span className="text-[10px] text-blue-400 truncate">
                    {entry.refs}
                  </span>
                )}
              </div>
              <div className="truncate">{entry.subject}</div>
              <div className="text-[10px] text-muted-foreground">
                {entry.author} · {timeAgo(entry.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {log.length > 0 && log.length % 50 === 0 && (
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onLoadLog(50, log.length)}
            >
              Load more
            </Button>
          </div>
        )}

        {log.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No commits yet
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
