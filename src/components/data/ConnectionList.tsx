import { Button } from "@/components/ui/button";
import {
  IconPlus,
  IconPlugConnected,
  IconPlugConnectedX,
  IconPencil,
  IconTrash,
  IconDatabase,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ConnectionConfig, ConnectionStatus } from "@shared/types/data";

interface ConnectionListProps {
  connections: ConnectionConfig[];
  connectionStatuses: Map<string, ConnectionStatus>;
  activeConnectionId: string | null;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (config: ConnectionConfig) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

function statusColor(status: ConnectionStatus | undefined): string {
  switch (status) {
    case "connected":
      return "bg-green-500";
    case "connecting":
      return "bg-yellow-500 animate-pulse";
    case "error":
      return "bg-destructive";
    default:
      return "bg-muted-foreground/30";
  }
}

function providerLabel(type: string): string {
  switch (type) {
    case "redis":
      return "Redis";
    case "sqlite":
      return "SQLite";
    default:
      return type;
  }
}

export function ConnectionList({
  connections,
  connectionStatuses,
  activeConnectionId,
  onSelect,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onAdd,
}: ConnectionListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Connections
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <IconPlus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <IconDatabase size={24} />
            <span className="text-xs">No connections</span>
            <Button variant="ghost" size="xs" onClick={onAdd}>
              <IconPlus size={12} />
              Add Connection
            </Button>
          </div>
        )}

        {connections.map((conn) => {
          const status = connectionStatuses.get(conn.id);
          const isActive = conn.id === activeConnectionId;
          const isConnected = status === "connected";

          return (
            <div
              key={conn.id}
              onClick={() => onSelect(conn.id)}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors",
                isActive && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  statusColor(status),
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{conn.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {providerLabel(conn.type)}
                  {conn.type === "redis" && ` · ${conn.host}:${conn.port}`}
                  {conn.type === "sqlite" &&
                    ` · ${conn.filePath.split("/").pop()}`}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {isConnected ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(conn.id);
                    }}
                  >
                    <IconPlugConnectedX size={12} />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConnect(conn.id);
                    }}
                  >
                    <IconPlugConnected size={12} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(conn);
                  }}
                >
                  <IconPencil size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conn.id);
                  }}
                  className="hover:text-destructive"
                >
                  <IconTrash size={12} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
