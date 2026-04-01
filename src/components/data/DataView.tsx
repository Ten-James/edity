import { useState, useCallback } from "react";
import { useDataState } from "@/hooks/useDataState";
import { ConnectionList } from "./ConnectionList";
import { ConnectionForm } from "./ConnectionForm";
import { RedisBrowser } from "./RedisBrowser";
import { SqliteBrowser } from "./SqliteBrowser";
import { IconDatabase } from "@tabler/icons-react";
import type { ConnectionConfig } from "@shared/types/data";

interface DataViewProps {
  tabId: string;
  isActive: boolean;
  projectId: string;
  connectionId?: string;
}

export function DataView({
  tabId: _tabId,
  isActive,
  projectId,
  connectionId: _initialConnectionId,
}: DataViewProps) {
  const data = useDataState(projectId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] =
    useState<ConnectionConfig | null>(null);

  const activeConnection = data.connections.find(
    (c) => c.id === data.activeConnectionId,
  );
  const activeStatus = data.activeConnectionId
    ? data.connectionStatuses.get(data.activeConnectionId)
    : undefined;

  const handleAdd = useCallback(() => {
    setEditingConnection(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((config: ConnectionConfig) => {
    setEditingConnection(config);
    setFormOpen(true);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const status = data.connectionStatuses.get(id);
      if (status === "connected") {
        data.setActiveConnection(id);
      }
    },
    [data.connectionStatuses, data.setActiveConnection],
  );

  const handleConnect = useCallback(
    async (id: string) => {
      const result = await data.connect(id);
      if (result.ok) {
        data.setActiveConnection(id);
      }
    },
    [data.connect, data.setActiveConnection],
  );

  return (
    <div
      className="absolute inset-0 flex bg-background"
      style={{ display: isActive ? "flex" : "none" }}
    >
      {/* Connection sidebar */}
      <div className="w-56 border-r border-border shrink-0 flex flex-col">
        <ConnectionList
          connections={data.connections}
          connectionStatuses={data.connectionStatuses}
          activeConnectionId={data.activeConnectionId}
          onSelect={handleSelect}
          onConnect={handleConnect}
          onDisconnect={data.disconnect}
          onEdit={handleEdit}
          onDelete={data.deleteConnection}
          onAdd={handleAdd}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeConnection && activeStatus === "connected" ? (
          <>
            {activeConnection.type === "redis" && (
              <RedisBrowser
                keys={data.redisKeys}
                hasMore={data.redisHasMore}
                pattern={data.redisPattern}
                selectedKey={data.selectedRedisKey}
                onScan={data.scanRedisKeys}
                onGetKey={data.getRedisKey}
                onDeleteKey={data.deleteRedisKey}
              />
            )}
            {activeConnection.type === "sqlite" && (
              <SqliteBrowser
                tables={data.sqliteTables}
                columns={data.sqliteColumns}
                selectedTable={data.selectedTable}
                queryResult={data.queryResult}
                queryError={data.queryError}
                onLoadTables={data.loadSqliteTables}
                onSelectTable={data.loadSqliteColumns}
                onExecuteQuery={data.executeSqliteQuery}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <IconDatabase size={32} />
            <span className="text-sm">
              {data.connections.length === 0
                ? "Add a connection to get started"
                : "Connect to a database to browse data"}
            </span>
          </div>
        )}
      </div>

      {/* Connection form dialog */}
      <ConnectionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={data.saveConnection}
        onTest={data.testConnection}
        projectId={projectId}
        initial={editingConnection}
      />
    </div>
  );
}
