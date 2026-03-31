import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@/lib/ipc";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAppContext } from "@/contexts/AppContext";
import "@xterm/xterm/css/xterm.css";

interface ClaudeStatus {
  isClaudeCode: boolean;
  oscTitle: string | null;
  status: string;
  sessionId: string | null;
  cwd: string | null;
  startedAt: number | null;
}

interface TerminalViewProps {
  tabId: string;
  isActive: boolean;
  cwd?: string;
  initialCommand?: string;
}

export function TerminalView({ tabId, isActive, cwd, initialCommand }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { activeTheme } = useTheme();
  const { updateTabTitle } = useAppContext();

  // Poll for foreground process name + Claude Code status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const name = await invoke<string | null>("get_foreground_process", {
          tabId,
        });
        if (!name) return;

        // Check Claude status (cheap — just reads in-memory state set by OSC detection)
        const status = await invoke<ClaudeStatus | null>(
          "get_claude_status",
          { tabId },
        );
        if (status) {
          const label =
            status.status === "active"
              ? "Claude Code"
              : `Claude Code (${status.status})`;
          updateTabTitle(tabId, label);
        } else {
          updateTabTitle(tabId, name);
        }
      } catch {
        // PTY may not be ready yet or already closed
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [tabId, updateTabTitle]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: activeTheme.terminal,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    term.focus();
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Listen for PTY output via Electron IPC
    const unlisten = window.electronAPI.on(
      `pty-output-${tabId}`,
      (data: unknown) => {
        term.write(data as string);
      },
    );

    // Spawn shell
    invoke("spawn_shell", { tabId, cwd: cwd ?? null, initialCommand: initialCommand ?? null });

    term.onData((data: string) => {
      invoke("write_to_pty", { tabId, data });
    });

    term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { tabId, cols, rows });
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("resize_pty", { tabId, cols: term.cols, rows: term.rows });
    });
    ro.observe(terminalRef.current);

    setTimeout(() => {
      fitAddon.fit();
      invoke("resize_pty", { tabId, cols: term.cols, rows: term.rows });
    }, 100);

    return () => {
      unlisten();
      ro.disconnect();
      term.dispose();
      invoke("close_pty", { tabId });
    };
  }, [tabId]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = activeTheme.terminal;
    }
  }, [activeTheme]);

  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          invoke("resize_pty", {
            tabId,
            cols: termRef.current.cols,
            rows: termRef.current.rows,
          });
          termRef.current.focus();
        }
      }, 0);
    }
  }, [isActive, tabId]);

  return (
    <div
      ref={terminalRef}
      className="absolute inset-0"
      style={{ display: isActive ? "block" : "none" }}
    />
  );
}
