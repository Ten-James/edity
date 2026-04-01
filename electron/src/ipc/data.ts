import { ipcMain } from "electron";
import * as fs from "fs";
import { CONFIG_DIR } from "../lib/state";
import * as path from "path";
import {
  createProvider,
  RedisProvider,
  SqliteProvider,
  type DataProvider,
  type RedisDataProvider,
  type SqliteDataProvider,
} from "../lib/data-providers";
import type { ConnectionConfig } from "../../../shared/types/data";

const DATA_CONNECTIONS_PATH = path.join(CONFIG_DIR, "data-connections.json");

// Runtime provider instances
const activeProviders = new Map<string, DataProvider>();

// ─── Connection CRUD ───────────────────────────────────────────

function loadConnections(): ConnectionConfig[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_CONNECTIONS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveConnections(connections: ConnectionConfig[]): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(DATA_CONNECTIONS_PATH, JSON.stringify(connections, null, 2));
}

function findConnection(connectionId: string): ConnectionConfig | undefined {
  return loadConnections().find((c) => c.id === connectionId);
}

function getRedis(connectionId: string): RedisDataProvider {
  const provider = activeProviders.get(connectionId);
  if (!provider || !(provider instanceof RedisProvider)) throw new Error("Not connected (Redis)");
  return provider;
}

function getSqlite(connectionId: string): SqliteDataProvider {
  const provider = activeProviders.get(connectionId);
  if (!provider || !(provider instanceof SqliteProvider)) throw new Error("Not connected (SQLite)");
  return provider;
}

// ─── Register Handlers ─────────────────────────────────────────

export function registerDataHandlers(): void {
  ipcMain.handle("data_get_connections", (_event, { projectId }: { projectId: string }) => {
    return loadConnections().filter((c) => c.projectId === projectId);
  });

  ipcMain.handle("data_save_connection", (_event, { connection }: { connection: ConnectionConfig }) => {
    const connections = loadConnections();
    const idx = connections.findIndex((c) => c.id === connection.id);
    if (idx >= 0) {
      connections[idx] = connection;
    } else {
      connections.push(connection);
    }
    saveConnections(connections);
    return connection;
  });

  ipcMain.handle("data_delete_connection", async (_event, { connectionId }: { connectionId: string }) => {
    const provider = activeProviders.get(connectionId);
    if (provider) {
      await provider.disconnect();
      activeProviders.delete(connectionId);
    }
    const connections = loadConnections().filter((c) => c.id !== connectionId);
    saveConnections(connections);
  });

  ipcMain.handle("data_test_connection", async (_event, { connection }: { connection: ConnectionConfig }) => {
    const provider = createProvider(connection);
    return provider.testConnection();
  });

  ipcMain.handle("data_connect", async (_event, { connectionId }: { connectionId: string }) => {
    const config = findConnection(connectionId);
    if (!config) return { ok: false, error: "Connection not found" };

    const existing = activeProviders.get(connectionId);
    if (existing) {
      await existing.disconnect();
    }

    try {
      const provider = createProvider(config);
      await provider.connect();
      activeProviders.set(connectionId, provider);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("data_disconnect", async (_event, { connectionId }: { connectionId: string }) => {
    const provider = activeProviders.get(connectionId);
    if (provider) {
      await provider.disconnect();
      activeProviders.delete(connectionId);
    }
  });

  // ─── Redis Operations ──────────────────────────────────────

  ipcMain.handle(
    "data_redis_scan",
    async (_event, { connectionId, cursor, pattern, count }: { connectionId: string; cursor: string; pattern: string; count: number }) => {
      return getRedis(connectionId).scan(cursor, pattern, count);
    },
  );

  ipcMain.handle(
    "data_redis_get_key",
    async (_event, { connectionId, key }: { connectionId: string; key: string }) => {
      return getRedis(connectionId).getKey(key);
    },
  );

  ipcMain.handle(
    "data_redis_delete_key",
    async (_event, { connectionId, key }: { connectionId: string; key: string }) => {
      return getRedis(connectionId).deleteKey(key);
    },
  );

  ipcMain.handle(
    "data_redis_info",
    async (_event, { connectionId }: { connectionId: string }) => {
      return getRedis(connectionId).getInfo();
    },
  );

  // ─── SQLite Operations ─────────────────────────────────────

  ipcMain.handle(
    "data_sqlite_tables",
    (_event, { connectionId }: { connectionId: string }) => {
      return getSqlite(connectionId).getTables();
    },
  );

  ipcMain.handle(
    "data_sqlite_columns",
    (_event, { connectionId, table }: { connectionId: string; table: string }) => {
      return getSqlite(connectionId).getColumns(table);
    },
  );

  ipcMain.handle(
    "data_sqlite_query",
    (_event, { connectionId, sql, params }: { connectionId: string; sql: string; params?: unknown[] }) => {
      return getSqlite(connectionId).query(sql, params);
    },
  );
}

// ─── Cleanup ───────────────────────────────────────────────────

export async function cleanupDataConnections(): Promise<void> {
  for (const provider of activeProviders.values()) {
    try {
      await provider.disconnect();
    } catch {
      // best-effort
    }
  }
  activeProviders.clear();
}
