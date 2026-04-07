import * as http from "http";
import * as os from "os";
import * as crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";
import { ptyInstances, sendToWindow } from "../lib/state";
import { getMobileHtml } from "./mobile-page";
import { loadSettings } from "../ipc/settings";

// ── Module state ───────────────────────────────────────────────

let httpServer: http.Server | null = null;
let wsServer: WebSocketServer | null = null;
let authToken: string | null = null;
let mobileHtml: string | null = null;

interface ClientState {
  selectedTabId: string | null;
  ptyDisposer: (() => void) | null;
}

const clients = new Map<WebSocket, ClientState>();

// ── Helpers ────────────────────────────────────────────────────

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of ["en0", "en1", "eth0", "wlan0"]) {
    const iface = interfaces[name];
    if (!iface) continue;
    const v4 = iface.find((i) => i.family === "IPv4" && !i.internal);
    if (v4) return v4.address;
  }
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    const v4 = iface.find((i) => i.family === "IPv4" && !i.internal);
    if (v4) return v4.address;
  }
  return "127.0.0.1";
}

function getTerminalList(): Array<{ tabId: string; title: string }> {
  return Array.from(ptyInstances.keys()).map((tabId) => ({
    tabId,
    title: tabId.slice(0, 8),
  }));
}

function broadcastToAll(msg: object): void {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function broadcastTerminalList(): void {
  broadcastToAll({ type: "terminal-list-updated", terminals: getTerminalList() });
}

function broadcastClientCount(): void {
  sendToWindow("remote-access-clients-changed", { count: clients.size });
}

function attachPtyListener(ws: WebSocket, state: ClientState, tabId: string): void {
  // Detach previous
  state.ptyDisposer?.();
  state.ptyDisposer = null;
  state.selectedTabId = null;

  const ptyProcess = ptyInstances.get(tabId);
  if (!ptyProcess) {
    ws.send(JSON.stringify({ type: "terminal-list-updated", terminals: getTerminalList() }));
    return;
  }

  const listener = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "pty-output", data }));
    }
  };

  (ptyProcess as unknown as NodeJS.EventEmitter).on("data", listener);
  state.selectedTabId = tabId;
  state.ptyDisposer = () => {
    (ptyProcess as unknown as NodeJS.EventEmitter).removeListener("data", listener);
  };

  ws.send(JSON.stringify({ type: "terminal-selected", tabId }));
}

function handleClientMessage(ws: WebSocket, state: ClientState, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "list-terminals":
      ws.send(JSON.stringify({ type: "terminal-list", terminals: getTerminalList() }));
      break;

    case "select-terminal": {
      const tabId = String(msg.tabId);
      attachPtyListener(ws, state, tabId);
      break;
    }

    case "pty-input": {
      if (state.selectedTabId) {
        ptyInstances.get(state.selectedTabId)?.write(String(msg.data));
      }
      break;
    }

    case "create-terminal":
      sendToWindow("mcp-dispatch", { type: "tab-create-terminal" });
      break;
  }
}

function cleanupClient(ws: WebSocket): void {
  const state = clients.get(ws);
  if (state) {
    state.ptyDisposer?.();
    clients.delete(ws);
  }
  broadcastClientCount();
}

// ── Public API ─────────────────────────────────────────────────

export async function startRemoteAccessServer(): Promise<{ qrDataUrl: string; serverUrl: string }> {
  if (httpServer) {
    throw new Error("Remote access server is already running");
  }

  authToken = crypto.randomBytes(16).toString("hex");
  const tokenPath = `/${authToken}`;

  const ip = getLocalIp();

  httpServer = http.createServer((req, res) => {
    if (req.url === tokenPath || req.url === `${tokenPath}/`) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(mobileHtml);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  wsServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== tokenPath && req.url !== `${tokenPath}/`) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wsServer!.handleUpgrade(req, socket, head, (ws) => {
      wsServer!.emit("connection", ws, req);
    });
  });

  wsServer.on("connection", (ws) => {
    const state: ClientState = { selectedTabId: null, ptyDisposer: null };
    clients.set(ws, state);
    broadcastClientCount();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as Record<string, unknown>;
        handleClientMessage(ws, state, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => cleanupClient(ws));
    ws.on("error", () => cleanupClient(ws));
  });

  return new Promise((resolve, reject) => {
    httpServer!.listen(0, "0.0.0.0", async () => {
      try {
        const addr = httpServer!.address() as { port: number };
        const serverUrl = `http://${ip}:${addr.port}${tokenPath}`;
        const wsUrl = `ws://${ip}:${addr.port}${tokenPath}`;

        const settings = loadSettings();
        mobileHtml = getMobileHtml(wsUrl, settings.monoFontFamily);

        const qrDataUrl = await QRCode.toDataURL(serverUrl, {
          width: 300,
          margin: 2,
          color: { dark: "#1a1a2e", light: "#ffffff" },
        });

        resolve({ qrDataUrl, serverUrl });
      } catch (err) {
        reject(err);
      }
    });

    httpServer!.on("error", reject);
  });
}

export async function stopRemoteAccessServer(): Promise<void> {
  for (const [ws] of clients) {
    ws.close();
  }
  clients.clear();

  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }

  authToken = null;
  mobileHtml = null;
  broadcastClientCount();
}

export function getRemoteAccessStatus(): { running: boolean; serverUrl: string | null; connectedClients: number } {
  if (!httpServer || !authToken) {
    return { running: false, serverUrl: null, connectedClients: 0 };
  }
  const addr = httpServer.address() as { port: number } | null;
  const serverUrl = addr ? `http://${getLocalIp()}:${addr.port}/${authToken}` : null;
  return { running: true, serverUrl, connectedClients: clients.size };
}

export function notifyPtyCreated(_tabId: string): void {
  if (!wsServer) return;
  broadcastTerminalList();
}

export function notifyPtyDestroyed(tabId: string): void {
  if (!wsServer) return;
  for (const [_ws, state] of clients) {
    if (state.selectedTabId === tabId) {
      state.ptyDisposer?.();
      state.selectedTabId = null;
      state.ptyDisposer = null;
    }
  }
  broadcastTerminalList();
}
