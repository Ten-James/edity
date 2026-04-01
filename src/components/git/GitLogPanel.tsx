import { useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/git-utils";
import { computeGraph, getColorHex } from "@/lib/git-graph";
import type { GitLogEntry } from "@/types/git";

const ROW_HEIGHT = 28;
const COL_WIDTH = 16;
const DOT_RADIUS = 3.5;

interface GitLogPanelProps {
  log: GitLogEntry[];
  selectedHash: string | null;
  onLoadLog: (count?: number, skip?: number) => Promise<void>;
  onSelectCommit: (hash: string) => void;
}

function GraphSvg({
  nodes,
  rowIndex,
}: {
  nodes: ReturnType<typeof computeGraph>;
  rowIndex: number;
}) {
  const node = nodes[rowIndex];
  if (!node) return null;

  // Determine SVG width from max column used in lines
  let maxCol = node.column;
  for (const line of node.lines) {
    maxCol = Math.max(maxCol, line.fromCol, line.toCol);
  }
  const width = (maxCol + 1) * COL_WIDTH + 8;
  const cx = node.column * COL_WIDTH + COL_WIDTH / 2 + 4;
  const cy = ROW_HEIGHT / 2;

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0"
      style={{ minWidth: width }}
    >
      {node.lines.map((line, i) => {
        const x1 = line.fromCol * COL_WIDTH + COL_WIDTH / 2 + 4;
        const x2 = line.toCol * COL_WIDTH + COL_WIDTH / 2 + 4;
        const color = getColorHex(line.color);

        if (x1 === x2) {
          // Straight pass-through line
          return (
            <line
              key={i}
              x1={x1}
              y1={0}
              x2={x2}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={2}
            />
          );
        }

        // Curved connection from this commit to parent's lane
        return (
          <path
            key={i}
            d={`M ${x1} ${cy} C ${x1} ${ROW_HEIGHT}, ${x2} ${cy}, ${x2} ${ROW_HEIGHT}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
          />
        );
      })}

      {/* Commit dot */}
      <circle
        cx={cx}
        cy={cy}
        r={DOT_RADIUS}
        fill={getColorHex(node.color)}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function GitLogPanel({
  log,
  selectedHash,
  onLoadLog,
  onSelectCommit,
}: GitLogPanelProps) {
  useEffect(() => {
    onLoadLog();
  }, [onLoadLog]);

  const graphNodes = computeGraph(log);

  return (
    <ScrollArea className="h-full">
      <div className="py-1 min-w-fit">
        {log.map((entry, i) => (
          <div
            key={entry.hash}
            onClick={() => onSelectCommit(entry.hash)}
            className={cn(
              "flex items-center text-xs cursor-pointer hover:bg-accent",
              selectedHash === entry.hash && "bg-accent",
            )}
            style={{ height: ROW_HEIGHT }}
          >
            <GraphSvg nodes={graphNodes} rowIndex={i} />
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {entry.shortHash}
              </span>
              {entry.refs && (
                <span className="text-[10px] text-blue-400 shrink-0 max-w-[120px] truncate">
                  {entry.refs}
                </span>
              )}
              <span className="truncate flex-1">{entry.subject}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {entry.author}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                {timeAgo(entry.timestamp)}
              </span>
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
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
