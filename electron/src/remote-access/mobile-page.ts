import * as fs from "fs";
import {
  DEFAULT_MONO_FONT_STACK,
  buildFontStack,
} from "../../../shared/lib/fonts";

let cachedXtermJs: string | null = null;
let cachedXtermCss: string | null = null;
let cachedFitAddonJs: string | null = null;

function loadAsset(modulePath: string): string {
  return fs.readFileSync(require.resolve(modulePath), "utf-8");
}

function getXtermJs(): string {
  if (!cachedXtermJs) cachedXtermJs = loadAsset("@xterm/xterm/lib/xterm.js");
  return cachedXtermJs;
}

function getXtermCss(): string {
  if (!cachedXtermCss) cachedXtermCss = loadAsset("@xterm/xterm/css/xterm.css");
  return cachedXtermCss;
}

function getFitAddonJs(): string {
  if (!cachedFitAddonJs) cachedFitAddonJs = loadAsset("@xterm/addon-fit/lib/addon-fit.js");
  return cachedFitAddonJs;
}

export function getMobileHtml(
  wsUrl: string,
  monoFontFamily: string | null,
): string {
  const termFontFamily = buildFontStack(monoFontFamily, DEFAULT_MONO_FONT_STACK);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Edity Remote</title>
<style>
${getXtermCss()}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }

#app { display: flex; flex-direction: column; height: 100%; }

#toolbar {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: #16213e; border-bottom: 1px solid #0f3460;
  flex-shrink: 0; overflow-x: auto; -webkit-overflow-scrolling: touch;
}

#toolbar .status {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
#toolbar .status.connected { background: #00d26a; }
#toolbar .status.disconnected { background: #f8333c; }

#toolbar select {
  background: #0f3460; color: #e0e0e0; border: 1px solid #533483;
  border-radius: 6px; padding: 6px 10px; font-size: 14px;
  flex: 1; min-width: 0; appearance: none;
  -webkit-appearance: none;
}

#toolbar button {
  background: #533483; color: #fff; border: none; border-radius: 6px;
  padding: 6px 14px; font-size: 14px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
#toolbar button:active { background: #6a42a0; }

#terminal-container {
  flex: 1; overflow: hidden;
}

#terminal-container .xterm { height: 100%; }

#reconnect-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.8);
  display: none; align-items: center; justify-content: center;
  flex-direction: column; gap: 16px; z-index: 100;
}
#reconnect-overlay.visible { display: flex; }
#reconnect-overlay p { font-size: 16px; color: #aaa; }
#reconnect-overlay button {
  background: #533483; color: #fff; border: none; border-radius: 8px;
  padding: 12px 24px; font-size: 16px; cursor: pointer;
}
</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <span class="status disconnected" id="status-dot"></span>
    <select id="terminal-select"><option value="">No terminals</option></select>
    <button id="new-terminal-btn">+ New</button>
  </div>
  <div id="terminal-container"></div>
</div>
<div id="reconnect-overlay">
  <p>Disconnected</p>
  <button id="reconnect-btn">Reconnect</button>
</div>

<script>
${getXtermJs()}
</script>
<script>
${getFitAddonJs()}
</script>
<script>
(function() {
  const WS_URL = ${JSON.stringify(wsUrl)};

  const statusDot = document.getElementById("status-dot");
  const termSelect = document.getElementById("terminal-select");
  const newTermBtn = document.getElementById("new-terminal-btn");
  const termContainer = document.getElementById("terminal-container");
  const reconnectOverlay = document.getElementById("reconnect-overlay");
  const reconnectBtn = document.getElementById("reconnect-btn");

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: ${JSON.stringify(termFontFamily)},
    theme: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#e0e0e0",
      selectionBackground: "rgba(83, 52, 131, 0.5)",
    },
    allowTransparency: true,
    scrollback: 5000,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termContainer);
  fitAddon.fit();

  let ws = null;
  let selectedTabId = null;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = function() {
      statusDot.className = "status connected";
      reconnectOverlay.classList.remove("visible");
      ws.send(JSON.stringify({ type: "list-terminals" }));
      if (selectedTabId) {
        ws.send(JSON.stringify({ type: "select-terminal", tabId: selectedTabId }));
      }
    };

    ws.onmessage = function(ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch(e) { return; }

      switch (msg.type) {
        case "terminal-list":
        case "terminal-list-updated":
          updateTerminalList(msg.terminals);
          break;
        case "terminal-selected":
          selectedTabId = msg.tabId;
          term.clear();
          term.focus();
          break;
        case "pty-output":
          term.write(msg.data);
          break;
        case "auth-fail":
          term.write("\\r\\n\\x1b[31mAuthentication failed.\\x1b[0m\\r\\n");
          break;
      }
    };

    ws.onclose = function() {
      statusDot.className = "status disconnected";
      reconnectOverlay.classList.add("visible");
    };

    ws.onerror = function() {
      ws.close();
    };
  }

  function updateTerminalList(terminals) {
    termSelect.innerHTML = "";
    if (terminals.length === 0) {
      termSelect.innerHTML = '<option value="">No terminals</option>';
      return;
    }
    terminals.forEach(function(t) {
      var opt = document.createElement("option");
      opt.value = t.tabId;
      opt.textContent = t.title;
      if (t.tabId === selectedTabId) opt.selected = true;
      termSelect.appendChild(opt);
    });
    // Auto-select first terminal if none selected
    if (!selectedTabId && terminals.length > 0) {
      selectedTabId = terminals[0].tabId;
      termSelect.value = selectedTabId;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "select-terminal", tabId: selectedTabId }));
      }
    }
  }

  termSelect.addEventListener("change", function() {
    selectedTabId = this.value;
    term.clear();
    if (ws && ws.readyState === WebSocket.OPEN && selectedTabId) {
      ws.send(JSON.stringify({ type: "select-terminal", tabId: selectedTabId }));
    }
  });

  newTermBtn.addEventListener("click", function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "create-terminal" }));
    }
  });

  term.onData(function(data) {
    if (ws && ws.readyState === WebSocket.OPEN && selectedTabId) {
      ws.send(JSON.stringify({ type: "pty-input", data: data }));
    }
  });

  reconnectBtn.addEventListener("click", function() {
    connect();
  });

  window.addEventListener("resize", function() {
    fitAddon.fit();
  });

  new ResizeObserver(function() {
    fitAddon.fit();
  }).observe(termContainer);

  connect();
})();
</script>
</body>
</html>`;
}
