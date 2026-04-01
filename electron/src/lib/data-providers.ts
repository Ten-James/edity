import type {
  ConnectionConfig,
  RedisConnectionConfig,
  SqliteConnectionConfig,
  RedisKeyInfo,
  RedisKeyValue,
  RedisKeyType,
  RedisScanResult,
  SqliteTableInfo,
  SqliteColumnInfo,
  SqliteQueryResult,
} from "../../../shared/types/data";

// ─── Provider Interface ────────────────────────────────────────

export interface DataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  isConnected(): boolean;
}

export interface RedisDataProvider extends DataProvider {
  scan(cursor: string, pattern: string, count: number): Promise<RedisScanResult>;
  getKey(key: string): Promise<RedisKeyValue>;
  deleteKey(key: string): Promise<boolean>;
  getInfo(): Promise<string>;
}

export interface SqliteDataProvider extends DataProvider {
  getTables(): SqliteTableInfo[];
  getColumns(table: string): SqliteColumnInfo[];
  query(sql: string, params?: unknown[]): SqliteQueryResult;
}

// ─── Identifier validation ─────────────────────────────────────

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/;

function assertSafeIdentifier(name: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
}

// ─── Redis Provider ────────────────────────────────────────────

export class RedisProvider implements RedisDataProvider {
  private client: import("ioredis").Redis | null = null;
  private config: RedisConnectionConfig;

  constructor(config: RedisConnectionConfig) {
    this.config = config;
  }

  private buildOptions() {
    return {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password || undefined,
      db: this.config.db ?? 0,
      tls: this.config.tls ? {} : undefined,
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    };
  }

  private requireClient(): import("ioredis").Redis {
    if (!this.client) throw new Error("Not connected");
    return this.client;
  }

  async connect(): Promise<void> {
    const Redis = (await import("ioredis")).default;
    this.client = new Redis(this.buildOptions());
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const Redis = (await import("ioredis")).default;
      const client = new Redis(this.buildOptions());
      await client.connect();
      await client.ping();
      client.disconnect();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  isConnected(): boolean {
    return this.client?.status === "ready";
  }

  async scan(cursor: string, pattern: string, count: number): Promise<RedisScanResult> {
    const client = this.requireClient();
    const [nextCursor, rawKeys] = await client.scan(cursor, "MATCH", pattern, "COUNT", count);
    const pipeline = client.pipeline();
    for (const key of rawKeys) {
      pipeline.type(key);
      pipeline.ttl(key);
    }
    const results = await pipeline.exec();
    const keys: RedisKeyInfo[] = rawKeys.map((key, i) => ({
      key,
      type: (results?.[i * 2]?.[1] as RedisKeyType) ?? "unknown",
      ttl: (results?.[i * 2 + 1]?.[1] as number) ?? -1,
    }));
    return { cursor: nextCursor, keys };
  }

  async getKey(key: string): Promise<RedisKeyValue> {
    const client = this.requireClient();
    const type = (await client.type(key)) as RedisKeyType;
    const ttl = await client.ttl(key);
    let value: string | string[] | Record<string, string>;
    let size = 0;

    switch (type) {
      case "string": {
        const v = await client.get(key);
        value = v ?? "";
        size = await client.strlen(key);
        break;
      }
      case "list": {
        value = await client.lrange(key, 0, 99);
        size = await client.llen(key);
        break;
      }
      case "set": {
        value = await client.smembers(key);
        size = await client.scard(key);
        break;
      }
      case "zset": {
        value = await client.zrange(key, 0, 99);
        size = await client.zcard(key);
        break;
      }
      case "hash": {
        value = await client.hgetall(key);
        size = await client.hlen(key);
        break;
      }
      default: {
        value = "(unsupported type)";
        size = 0;
      }
    }

    return { key, type, value, ttl, size };
  }

  async deleteKey(key: string): Promise<boolean> {
    const client = this.requireClient();
    const count = await client.del(key);
    return count > 0;
  }

  async getInfo(): Promise<string> {
    const client = this.requireClient();
    return client.info();
  }
}

// ─── SQLite Provider ───────────────────────────────────────────

export class SqliteProvider implements SqliteDataProvider {
  private db: import("better-sqlite3").Database | null = null;
  private config: SqliteConnectionConfig;

  constructor(config: SqliteConnectionConfig) {
    this.config = config;
  }

  private requireDb(): import("better-sqlite3").Database {
    if (!this.db) throw new Error("Not connected");
    return this.db;
  }

  private validateTableName(table: string): void {
    assertSafeIdentifier(table);
    const db = this.requireDb();
    const row = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
    ).get(table);
    if (!row) throw new Error(`Table not found: ${table}`);
  }

  async connect(): Promise<void> {
    const Database = (await import("better-sqlite3")).default;
    this.db = new Database(this.config.filePath, { readonly: false });
    this.db.pragma("journal_mode = WAL");
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(this.config.filePath, { readonly: true });
      db.pragma("journal_mode");
      db.close();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  getTables(): SqliteTableInfo[] {
    const db = this.requireDb();
    const tables = db
      .prepare(
        `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as Array<{ name: string; type: "table" | "view" }>;

    return tables.map((t) => {
      let rowCount = 0;
      try {
        // Table name comes from sqlite_master, safe to use
        const row = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number };
        rowCount = row.c;
      } catch {
        // view or error
      }
      return { name: t.name, type: t.type, rowCount };
    });
  }

  getColumns(table: string): SqliteColumnInfo[] {
    this.validateTableName(table);
    const db = this.requireDb();
    return db.prepare(`PRAGMA table_info("${table}")`).all() as SqliteColumnInfo[];
  }

  query(sql: string, params?: unknown[]): SqliteQueryResult {
    const db = this.requireDb();
    const trimmed = sql.trim().toUpperCase();
    const isSelect = trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA") || trimmed.startsWith("WITH") || trimmed.startsWith("EXPLAIN");

    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
      return {
        columns,
        rows: rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c])),
        rowCount: rows.length,
      };
    } else {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        changes: result.changes,
      };
    }
  }
}

// ─── Factory ───────────────────────────────────────────────────

export function createProvider(config: ConnectionConfig): DataProvider {
  switch (config.type) {
    case "redis":
      return new RedisProvider(config);
    case "sqlite":
      return new SqliteProvider(config);
  }
}
