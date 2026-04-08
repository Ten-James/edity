// Per-project, per-language LSP client registry. Files of the same language
// share a single client (and thus a single backend server process).

import { invoke } from "@/lib/ipc";
import {
  LspClient,
  spawnLspClient,
  type LspStartFailure,
} from "./client";
import type { LspLanguageId } from "./lang-map";

interface ServerDetectResult {
  available: boolean;
  binary?: string;
  binaryPath?: string | null;
  serverName?: string;
  installHint?: string;
  reason?: string;
}

const detectionCache = new Map<LspLanguageId, ServerDetectResult>();

export async function detectServer(
  lang: LspLanguageId,
): Promise<ServerDetectResult> {
  const cached = detectionCache.get(lang);
  if (cached) return cached;
  const result = await invoke<ServerDetectResult>("lsp_detect_server", { lang });
  detectionCache.set(lang, result);
  return result;
}

// Servers that we already showed an "install hint" toast for, so we don't
// nag the user once per file.
const hintedServers = new Set<string>();
export function markHintShown(serverName: string): boolean {
  if (hintedServers.has(serverName)) return false;
  hintedServers.add(serverName);
  return true;
}

// Key = `${projectId}:${lang}` so we look up by what the caller knows.
// Multiple langs may resolve to the same backend server (c/cpp -> clangd),
// in which case we end up with two registry entries pointing at one client.
const clients = new Map<string, LspClient>();
const pendingStarts = new Map<string, Promise<LspClient | null>>();

function registryKey(projectId: string, lang: LspLanguageId): string {
  return `${projectId}::${lang}`;
}

export function getClient(
  projectId: string,
  lang: LspLanguageId,
): LspClient | null {
  return clients.get(registryKey(projectId, lang)) ?? null;
}

export function getAllClientsForProject(projectId: string): LspClient[] {
  // Dedupe by client.key — multiple registry entries can point at one client.
  const seen = new Set<string>();
  const out: LspClient[] = [];
  for (const [k, c] of clients) {
    if (!k.startsWith(`${projectId}::`)) continue;
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

export interface GetOrStartParams {
  projectId: string;
  projectPath: string;
  lang: LspLanguageId;
  filePath: string;
}

export async function getOrStartClient(
  params: GetOrStartParams,
): Promise<{ ok: true; client: LspClient } | LspStartFailure> {
  const key = registryKey(params.projectId, params.lang);

  const existing = clients.get(key);
  if (existing) return { ok: true, client: existing };

  const inFlight = pendingStarts.get(key);
  if (inFlight) {
    const c = await inFlight;
    if (c) return { ok: true, client: c };
    return { ok: false, reason: "previous start failed" };
  }

  const startPromise = (async () => {
    const result = await spawnLspClient(params);
    if (!result.ok) {
      pendingStarts.delete(key);
      return null;
    }
    // Default server-to-client request handler. Most servers ask
    // workspace/configuration during init; we reply with `null` per item to
    // accept defaults. Servers that need real config (rust-analyzer) push
    // most of theirs via didChangeConfiguration which we don't issue —
    // returning null is still a valid spec response and avoids hangs.
    result.client.setServerRequestHandler((method, p) => {
      if (method === "workspace/configuration") {
        const params = p as { items?: unknown[] };
        return (params?.items ?? []).map(() => null);
      }
      if (method === "window/workDoneProgress/create") {
        return null;
      }
      if (method === "client/registerCapability") {
        return null; // we don't track dynamic registrations yet
      }
      if (method === "client/unregisterCapability") {
        return null;
      }
      return null;
    });
    clients.set(key, result.client);
    pendingStarts.delete(key);
    return result.client;
  })();

  pendingStarts.set(key, startPromise);
  const client = await startPromise;
  if (!client) return { ok: false, reason: "failed to start server" };
  return { ok: true, client };
}

export async function stopClientsForProject(projectId: string): Promise<void> {
  const toStop: LspClient[] = [];
  const toDelete: string[] = [];
  for (const [k, c] of clients) {
    if (k.startsWith(`${projectId}::`)) {
      toStop.push(c);
      toDelete.push(k);
    }
  }
  for (const k of toDelete) clients.delete(k);
  // Dedupe by underlying server key.
  const seen = new Set<string>();
  for (const c of toStop) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    c.dispose();
    try {
      await invoke("lsp_stop", { key: c.key });
    } catch {
      /* ignore */
    }
  }
  await invoke("lsp_stop_project", { projectId }).catch(() => {});
}

export async function shutdownAll(): Promise<void> {
  const all = Array.from(clients.values());
  clients.clear();
  pendingStarts.clear();
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    c.dispose();
    try {
      await invoke("lsp_stop", { key: c.key });
    } catch {
      /* ignore */
    }
  }
}
