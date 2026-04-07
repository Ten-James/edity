import { ipcMain } from "electron";
import * as os from "os";
import * as pty from "node-pty";
import {
  ptyInstances,
  tabClaudeState,
  sendToWindow,
} from "../lib/state";
import { notifyPtyCreated, notifyPtyDestroyed } from "../remote-access/server";

export function registerTerminalHandlers(): void {
  ipcMain.handle("spawn_shell", (_event, { tabId, cwd, initialCommand }: { tabId: string; cwd: string; initialCommand?: string }) => {
    const shell = process.env.SHELL || "/bin/sh";
    const ptyProcess = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env,
    });

    tabClaudeState.set(tabId, {
      isClaudeCode: false,
      oscTitle: null,
      status: null,
      claudePid: null,
      oscBuffer: "",
      pidLookupAt: 0,
    });

    let commandSent = !initialCommand;
    ptyProcess.onData((data: string) => {
      const state = tabClaudeState.get(tabId);
      if (state) {
        if (/\x1b\](9|99|777);/.test(data) && state.isClaudeCode) {
          sendToWindow("claude-notification", { tabId });
        }

        const combined = state.oscBuffer + data;
        const oscRe = /\x1b\]([02]);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
        const matches = [...combined.matchAll(oscRe)];
        if (matches.length > 0) {
          const last = matches[matches.length - 1];
          state.oscTitle = last[2];
          if (last[2].includes("Claude Code")) {
            state.isClaudeCode = true;
          }
          const lastMatchEnd = last.index! + last[0].length;
          const trailing = combined.slice(lastMatchEnd);
          state.oscBuffer = trailing.includes("\x1b]") ? trailing.slice(trailing.lastIndexOf("\x1b]")) : "";
        } else {
          const escIdx = combined.lastIndexOf("\x1b]");
          state.oscBuffer = escIdx >= 0 ? combined.slice(escIdx) : "";
        }
        if (state.oscBuffer.length > 1024) state.oscBuffer = "";
      }

      sendToWindow(`pty-output-${tabId}`, data);
      if (!commandSent) {
        commandSent = true;
        setTimeout(() => ptyProcess.write(initialCommand + "\n"), 100);
      }
    });

    ptyInstances.set(tabId, ptyProcess);
    notifyPtyCreated(tabId);
  });

  ipcMain.handle("write_to_pty", (_event, { tabId, data }: { tabId: string; data: string }) => {
    ptyInstances.get(tabId)?.write(data);
  });

  ipcMain.handle("resize_pty", (_event, { tabId, cols, rows }: { tabId: string; cols: number; rows: number }) => {
    ptyInstances.get(tabId)?.resize(cols, rows);
  });

  ipcMain.handle("close_pty", (_event, { tabId }: { tabId: string }) => {
    const proc = ptyInstances.get(tabId);
    if (proc) {
      proc.kill();
      ptyInstances.delete(tabId);
      notifyPtyDestroyed(tabId);
    }
    tabClaudeState.delete(tabId);
  });

  ipcMain.handle("get_foreground_process", (_event, { tabId }: { tabId: string }) => {
    const proc = ptyInstances.get(tabId);
    if (!proc) return null;
    const name = proc.process;
    if (!name) return null;
    return name.split("/").pop() || name;
  });
}
