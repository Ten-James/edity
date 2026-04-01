// ─── Provider Types ────────────────────────────────────────────

export type DataProviderType = "redis" | "sqlite";

// ─── Connection Configs ────────────────────────────────────────

interface BaseConnectionConfig {
  id: string;
  name: string;
  projectId: string;
  type: DataProviderType;
}

export interface RedisConnectionConfig extends BaseConnectionConfig {
  type: "redis";
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export interface SqliteConnectionConfig extends BaseConnectionConfig {
  type: "sqlite";
  filePath: string;
}

export type ConnectionConfig = RedisConnectionConfig | SqliteConnectionConfig;

// ─── Runtime State ─────────────────────────────────────────────

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ─── Redis Data Types ──────────────────────────────────────────

export type RedisKeyType = "string" | "list" | "set" | "zset" | "hash" | "stream" | "unknown";

export interface RedisKeyInfo {
  key: string;
  type: RedisKeyType;
  ttl: number;
}

export interface RedisKeyValue {
  key: string;
  type: RedisKeyType;
  value: string | string[] | Record<string, string>;
  ttl: number;
  size: number;
}

export interface RedisScanResult {
  cursor: string;
  keys: RedisKeyInfo[];
}

// ─── SQLite Data Types ─────────────────────────────────────────

export interface SqliteTableInfo {
  name: string;
  type: "table" | "view";
  rowCount: number;
}

export interface SqliteColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: string | null;
}

export interface SqliteQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  changes?: number;
}
