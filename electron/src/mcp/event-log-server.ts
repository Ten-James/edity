import * as http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sendToWindow } from "../lib/state";

// ── Tool definitions ───────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle: (args: Record<string, unknown>) => string;
}

function dispatchEvent(payload: Record<string, unknown>): void {
  sendToWindow("mcp-dispatch", payload);
}

const TOOLS: ToolDef[] = [
  // ── Tab actions ──
  {
    name: "open_file",
    description: "Open a file in an editor tab.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute path to the file" },
      },
      required: ["filePath"],
    },
    handle: (args) => {
      const filePath = String(args.filePath);
      dispatchEvent({ type: "tab-open-file", filePath });
      return `Opened file: ${filePath}`;
    },
  },
  {
    name: "open_terminal",
    description: "Open a new terminal tab, optionally running a command.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Initial command to run in the terminal" },
      },
    },
    handle: (args) => {
      const cmd = args.command ? String(args.command) : undefined;
      dispatchEvent({
        type: "tab-create-terminal",
        ...(cmd ? { initialCommand: cmd } : {}),
      });
      return cmd ? `Opened terminal with: ${cmd}` : "Opened terminal";
    },
  },
  {
    name: "open_browser",
    description: "Open a browser tab with a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open" },
      },
    },
    handle: (args) => {
      const url = args.url ? String(args.url) : undefined;
      dispatchEvent({
        type: "tab-create-browser",
        ...(url ? { initialUrl: url } : {}),
      });
      return url ? `Opened browser: ${url}` : "Opened browser";
    },
  },
  {
    name: "open_git",
    description: "Open the Git tab.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "tab-create-git" });
      return "Opened git tab";
    },
  },
  {
    name: "open_claude",
    description: "Open the Claude AI tab.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "tab-create-claude" });
      return "Opened claude tab";
    },
  },

  // ── Layout ──
  {
    name: "toggle_sidebar",
    description: "Toggle the file explorer or git sidebar.",
    inputSchema: {
      type: "object",
      properties: {
        panel: { type: "string", enum: ["files", "git"], description: "Which sidebar panel" },
      },
      required: ["panel"],
    },
    handle: (args) => {
      const panel = args.panel === "git" ? "git" : "files";
      dispatchEvent({ type: "layout-toggle-sidebar", panel });
      return `Toggled ${panel} sidebar`;
    },
  },
  {
    name: "toggle_theme",
    description: "Toggle between light and dark mode.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "settings-toggle-mode" });
      return "Toggled theme";
    },
  },

  // ── Run ──
  {
    name: "run_project",
    description: "Start the project's run command.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "run-start" });
      return "Started project run command";
    },
  },
  {
    name: "stop_project",
    description: "Stop the running project command.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "run-stop" });
      return "Stopped project run command";
    },
  },

  // ── Worktree ──
  {
    name: "create_worktree",
    description: "Create a git worktree and open a terminal tab in it.",
    inputSchema: {
      type: "object",
      properties: {
        branch: { type: "string", description: "Branch name for the worktree" },
        command: { type: "string", description: "Initial command to run in the worktree terminal" },
      },
      required: ["branch"],
    },
    handle: (args) => {
      const branch = String(args.branch);
      dispatchEvent({
        type: "worktree-create",
        branch,
        ...(args.command ? { initialCommand: String(args.command) } : {}),
      });
      return `Creating worktree for branch: ${branch}`;
    },
  },

  // ── Git ──
  {
    name: "refresh_git",
    description: "Refresh git branch info and diff stats.",
    inputSchema: { type: "object", properties: {} },
    handle: () => {
      dispatchEvent({ type: "git-refresh" });
      return "Git refreshed";
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

// ── MCP server ─────────────────────────────────────────────────

const DEFAULT_PORT = 4567;

let httpServer: http.Server | null = null;
let mcpServer: Server | null = null;
const transports = new Map<string, SSEServerTransport>();

function createMcpServer(): Server {
  const server = new Server(
    { name: "edity", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOL_MAP.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = tool.handle(args);
    return { content: [{ type: "text", text: result }] };
  });

  return server;
}

// ── Lifecycle ──────────────────────────────────────────────────

export async function startEventLogServer(
  port = DEFAULT_PORT,
): Promise<{ port: number }> {
  if (httpServer) throw new Error("MCP server already running");

  mcpServer = createMcpServer();

  httpServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/sse") {
      const transport = new SSEServerTransport("/message", res);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => transports.delete(transport.sessionId);
      await mcpServer!.connect(transport);
      await transport.start();
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/message")) {
      const url = new URL(req.url, `http://localhost:${port}`);
      const sessionId = url.searchParams.get("sessionId");
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(404);
        res.end("Session not found");
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    httpServer!.listen(port, "127.0.0.1", () => resolve({ port }));
    httpServer!.on("error", (err) => {
      httpServer = null;
      mcpServer = null;
      reject(err);
    });
  });
}

export async function stopEventLogServer(): Promise<void> {
  for (const transport of transports.values()) {
    await transport.close().catch(() => {});
  }
  transports.clear();

  if (mcpServer) {
    await mcpServer.close().catch(() => {});
    mcpServer = null;
  }

  return new Promise((resolve) => {
    if (!httpServer) return resolve();
    httpServer.close(() => {
      httpServer = null;
      resolve();
    });
  });
}

export function isRunning(): boolean {
  return httpServer !== null;
}
