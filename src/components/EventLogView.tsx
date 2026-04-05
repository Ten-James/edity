import { useEffect, useRef } from "react";
import { useMcpStore } from "@/stores/mcpStore";
import { Button } from "@/components/ui/button";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconCopy,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EventLogViewProps {
  isActive: boolean;
}

export function EventLogView({ isActive }: EventLogViewProps) {
  const { running, port, events, start, stop, clear, refreshStatus } =
    useMcpStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [events.length]);

  const handleToggle = async () => {
    try {
      if (running) {
        await stop();
      } else {
        await start();
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const sseUrl = port ? `http://127.0.0.1:${port}/sse` : null;

  const handleCopyUrl = () => {
    if (sseUrl) {
      navigator.clipboard.writeText(sseUrl);
      toast.success("URL copied");
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col bg-background",
        !isActive && "hidden",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleToggle}
          className={running ? "text-green-400" : "text-muted-foreground"}
        >
          {running ? (
            <IconPlayerStop size={14} />
          ) : (
            <IconPlayerPlay size={14} />
          )}
        </Button>

        <span className="text-xs font-medium">Event Log</span>

        {running && sseUrl && (
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-mono bg-muted px-1.5 py-0.5"
          >
            <IconCopy size={10} />
            {sseUrl}
          </button>
        )}

        {!running && (
          <span className="text-[10px] text-muted-foreground">
            MCP stopped
          </span>
        )}

        <div className="flex-1" />

        <span className="text-[10px] text-muted-foreground">
          {events.length}
        </span>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clear}
          disabled={events.length === 0}
        >
          <IconTrash size={12} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-xs text-muted-foreground">
            No events yet
          </div>
        ) : (
          <div className="font-mono text-[11px] leading-relaxed">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex gap-2 px-3 py-0.5 hover:bg-muted/30 border-b border-border/30"
              >
                <span className="shrink-0 text-muted-foreground/60">
                  {e.timestamp.slice(11, 23)}
                </span>
                <span className="shrink-0 text-primary">{e.type}</span>
                {Object.keys(e.payload).length > 0 && (
                  <span className="text-muted-foreground truncate">
                    {JSON.stringify(e.payload)}
                  </span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
