import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@/lib/ipc";
import type {
  ConnectionConfig,
  ConnectionStatus,
  RedisKeyInfo,
  RedisKeyValue,
  RedisScanResult,
  SqliteTableInfo,
  SqliteColumnInfo,
  SqliteQueryResult,
} from "@shared/types/data";

interface DataState {
  connections: ConnectionConfig[];
  connectionStatuses: Map<string, ConnectionStatus>;
  activeConnectionId: string | null;
  loading: boolean;
  error: string | null;

  // Redis
  redisKeys: RedisKeyInfo[];
  redisCursor: string;
  redisPattern: string;
  redisHasMore: boolean;
  selectedRedisKey: RedisKeyValue | null;

  // SQLite
  sqliteTables: SqliteTableInfo[];
  sqliteColumns: SqliteColumnInfo[];
  selectedTable: string | null;
  queryResult: SqliteQueryResult | null;
  queryError: string | null;
}

const BROWSING_RESET = {
  redisKeys: [] as RedisKeyInfo[],
  redisCursor: "0",
  redisHasMore: false,
  selectedRedisKey: null,
  sqliteTables: [] as SqliteTableInfo[],
  sqliteColumns: [] as SqliteColumnInfo[],
  selectedTable: null,
  queryResult: null,
  queryError: null,
} as const;

const initialState: DataState = {
  connections: [],
  connectionStatuses: new Map(),
  activeConnectionId: null,
  loading: false,
  error: null,
  redisPattern: "*",
  ...BROWSING_RESET,
};

export function useDataState(projectId: string) {
  const [state, setState] = useState<DataState>(initialState);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const activeConnRef = useRef(state.activeConnectionId);
  activeConnRef.current = state.activeConnectionId;

  // Helper to get current connection ID or bail
  function getConnId(): string | null {
    return activeConnRef.current;
  }

  // ─── Connection CRUD ───────────────────────────────────────

  const loadConnections = useCallback(async () => {
    const connections = await invoke<ConnectionConfig[]>(
      "data_get_connections",
      { projectId: projectIdRef.current },
    );
    setState((s) => ({ ...s, connections }));
  }, []);

  const saveConnection = useCallback(
    async (connection: ConnectionConfig) => {
      await invoke<ConnectionConfig>("data_save_connection", { connection });
      await loadConnections();
    },
    [loadConnections],
  );

  const deleteConnection = useCallback(
    async (connectionId: string) => {
      await invoke<void>("data_delete_connection", { connectionId });
      setState((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.delete(connectionId);
        return {
          ...s,
          connectionStatuses: statuses,
          activeConnectionId:
            s.activeConnectionId === connectionId ? null : s.activeConnectionId,
        };
      });
      await loadConnections();
    },
    [loadConnections],
  );

  const testConnection = useCallback(
    async (
      connection: ConnectionConfig,
    ): Promise<{ ok: boolean; error?: string }> => {
      return invoke<{ ok: boolean; error?: string }>("data_test_connection", {
        connection,
      });
    },
    [],
  );

  // ─── Connect / Disconnect ──────────────────────────────────

  const connect = useCallback(async (connectionId: string) => {
    setState((s) => ({
      ...s,
      connectionStatuses: new Map(s.connectionStatuses).set(
        connectionId,
        "connecting",
      ),
    }));
    try {
      const result = await invoke<{ ok: boolean; error?: string }>(
        "data_connect",
        { connectionId },
      );
      setState((s) => ({
        ...s,
        connectionStatuses: new Map(s.connectionStatuses).set(
          connectionId,
          result.ok ? "connected" : "error",
        ),
        activeConnectionId: result.ok ? connectionId : s.activeConnectionId,
        error: result.ok ? null : (result.error ?? "Connection failed"),
        ...BROWSING_RESET,
      }));
      return result;
    } catch (err) {
      setState((s) => ({
        ...s,
        connectionStatuses: new Map(s.connectionStatuses).set(
          connectionId,
          "error",
        ),
        error: String(err),
      }));
      return { ok: false, error: String(err) };
    }
  }, []);

  const disconnect = useCallback(async (connectionId: string) => {
    await invoke<void>("data_disconnect", { connectionId });
    setState((s) => ({
      ...s,
      connectionStatuses: new Map(s.connectionStatuses).set(
        connectionId,
        "disconnected",
      ),
      activeConnectionId:
        s.activeConnectionId === connectionId ? null : s.activeConnectionId,
    }));
  }, []);

  const setActiveConnection = useCallback((connectionId: string | null) => {
    setState((s) => ({
      ...s,
      activeConnectionId: connectionId,
      ...BROWSING_RESET,
    }));
  }, []);

  // ─── Redis Operations ──────────────────────────────────────

  const scanRedisKeys = useCallback(
    async (pattern: string = "*", reset: boolean = true) => {
      const connId = getConnId();
      if (!connId) return;

      // Read cursor from state via setState to avoid stale closure
      setState((s) => {
        const cursor = reset ? "0" : s.redisCursor;
        invoke<RedisScanResult>("data_redis_scan", {
          connectionId: connId,
          cursor,
          pattern,
          count: 100,
        })
          .then((result) => {
            setState((prev) => ({
              ...prev,
              redisKeys: reset
                ? result.keys
                : [...prev.redisKeys, ...result.keys],
              redisCursor: result.cursor,
              redisPattern: pattern,
              redisHasMore: result.cursor !== "0",
            }));
          })
          .catch((err) => {
            setState((prev) => ({ ...prev, error: String(err) }));
          });
        return s; // no immediate state change
      });
    },
    [],
  );

  const getRedisKey = useCallback(async (key: string) => {
    const connId = getConnId();
    if (!connId) return;
    try {
      const value = await invoke<RedisKeyValue>("data_redis_get_key", {
        connectionId: connId,
        key,
      });
      setState((s) => ({ ...s, selectedRedisKey: value }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, []);

  const deleteRedisKey = useCallback(async (key: string) => {
    const connId = getConnId();
    if (!connId) return;
    await invoke<boolean>("data_redis_delete_key", {
      connectionId: connId,
      key,
    });
    setState((s) => ({
      ...s,
      redisKeys: s.redisKeys.filter((k) => k.key !== key),
      selectedRedisKey:
        s.selectedRedisKey?.key === key ? null : s.selectedRedisKey,
    }));
  }, []);

  // ─── SQLite Operations ─────────────────────────────────────

  const loadSqliteTables = useCallback(async () => {
    const connId = getConnId();
    if (!connId) return;
    try {
      const tables = await invoke<SqliteTableInfo[]>("data_sqlite_tables", {
        connectionId: connId,
      });
      setState((s) => ({ ...s, sqliteTables: tables }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, []);

  const loadSqliteColumns = useCallback(async (table: string) => {
    const connId = getConnId();
    if (!connId) return;
    try {
      const columns = await invoke<SqliteColumnInfo[]>("data_sqlite_columns", {
        connectionId: connId,
        table,
      });
      setState((s) => ({ ...s, sqliteColumns: columns, selectedTable: table }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, []);

  const executeSqliteQuery = useCallback(
    async (sql: string, params?: unknown[]) => {
      const connId = getConnId();
      if (!connId) return;
      setState((s) => ({ ...s, queryError: null }));
      try {
        const result = await invoke<SqliteQueryResult>("data_sqlite_query", {
          connectionId: connId,
          sql,
          params,
        });
        setState((s) => ({ ...s, queryResult: result }));
      } catch (err) {
        setState((s) => ({ ...s, queryError: String(err) }));
      }
    },
    [],
  );

  // ─── Load on mount ─────────────────────────────────────────

  useEffect(() => {
    loadConnections();
  }, [projectId, loadConnections]);

  return {
    ...state,
    loadConnections,
    saveConnection,
    deleteConnection,
    testConnection,
    connect,
    disconnect,
    setActiveConnection,
    scanRedisKeys,
    getRedisKey,
    deleteRedisKey,
    loadSqliteTables,
    loadSqliteColumns,
    executeSqliteQuery,
  };
}
