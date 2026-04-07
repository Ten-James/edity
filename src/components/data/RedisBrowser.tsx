import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { IconSearch, IconTrash, IconRefresh } from "@tabler/icons-react";
import type { RedisKeyInfo, RedisKeyValue } from "@shared/types/data";

interface RedisBrowserProps {
  keys: RedisKeyInfo[];
  hasMore: boolean;
  pattern: string;
  selectedKey: RedisKeyValue | null;
  onScan: (pattern: string, reset: boolean) => Promise<void>;
  onGetKey: (key: string) => Promise<void>;
  onDeleteKey: (key: string) => Promise<void>;
}

function typeBadgeColor(type: string): string {
  switch (type) {
    case "string":
      return "bg-blue-500/10 text-blue-500";
    case "list":
      return "bg-green-500/10 text-green-500";
    case "set":
      return "bg-purple-500/10 text-purple-500";
    case "zset":
      return "bg-orange-500/10 text-orange-500";
    case "hash":
      return "bg-pink-500/10 text-pink-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function RedisValueViewer({ value }: { value: RedisKeyValue }) {
  if (typeof value.value === "string") {
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 bg-muted rounded-md">
        {value.value}
      </pre>
    );
  }

  if (Array.isArray(value.value)) {
    return (
      <div className="flex flex-col gap-1">
        {value.value.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md"
          >
            <span className="text-[10px] text-muted-foreground w-6 shrink-0">
              {i}
            </span>
            <span className="text-xs font-mono break-all">{item}</span>
          </div>
        ))}
      </div>
    );
  }

  // Hash / Record
  return (
    <div className="flex flex-col gap-1">
      {Object.entries(value.value).map(([k, v]) => (
        <div
          key={k}
          className="flex items-start gap-2 px-3 py-1.5 bg-muted rounded-md"
        >
          <span className="text-xs font-mono font-semibold shrink-0 text-primary">
            {k}
          </span>
          <span className="text-xs font-mono break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function RedisBrowser({
  keys,
  hasMore,
  pattern,
  selectedKey,
  onScan,
  onGetKey,
  onDeleteKey,
}: RedisBrowserProps) {
  const [search, setSearch] = useState(pattern);

  useEffect(() => {
    // Initial scan on mount with the pattern provided by the parent.
    // Subsequent scans are user-driven via the search box.
    onScan(pattern, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    onScan(search || "*", true);
  }

  const sortedKeys = [...keys].sort((a, b) => {
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) return typeCmp;
    return b.key.localeCompare(a.key);
  });

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Key list */}
      <div className="w-72 border-r border-border shrink-0 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="Pattern (e.g. user:*)"
            className="h-7 text-xs"
          />
          <Button variant="ghost" size="icon-xs" onClick={handleSearch}>
            <IconSearch size={14} />
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            {sortedKeys.map((k) => (
              <div
                key={k.key}
                onClick={() => onGetKey(k.key)}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors ${selectedKey?.key === k.key ? "bg-accent" : ""}`}
              >
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 shrink-0 ${typeBadgeColor(k.type)}`}
                >
                  {k.type}
                </Badge>
                <span className="text-xs font-mono truncate flex-1">
                  {k.key}
                </span>
              </div>
            ))}
            {hasMore && (
              <div className="px-2 py-2">
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full"
                  onClick={() => onScan(search || "*", false)}
                >
                  <IconRefresh size={12} />
                  Load More
                </Button>
              </div>
            )}
            {keys.length === 0 && (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                No keys found
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Value viewer */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedKey ? (
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={typeBadgeColor(selectedKey.type)}
                    >
                      {selectedKey.type}
                    </Badge>
                    <span className="text-sm font-mono font-medium">
                      {selectedKey.key}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDeleteKey(selectedKey.key)}
                    className="hover:text-destructive"
                  >
                    <IconTrash size={14} />
                  </Button>
                </div>

                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    TTL:{" "}
                    {selectedKey.ttl === -1 ? "none" : `${selectedKey.ttl}s`}
                  </span>
                  <span>Size: {selectedKey.size}</span>
                </div>

                <RedisValueViewer value={selectedKey} />
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Select a key to view its value
          </div>
        )}
      </div>
    </div>
  );
}
