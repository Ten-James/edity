import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@/lib/ipc";
import { dispatch } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  DEFAULT_MONO_FONT_STACK,
  buildFontStack,
} from "@shared/lib/fonts";

interface ClaudeStatus {
  isClaudeCode: boolean;
  oscTitle: string | null;
  status: string;
  sessionId: string | null;
  cwd: string | null;
  startedAt: number | null;
}

interface UseTerminalOptions {
  tabId: string;
  isActive: boolean;
  cwd?: string;
  initialCommand?: string;
}

export function useTerminal({
  tabId,
  isActive,
  cwd,
  initialCommand,
}: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const monoFont = useSettingsStore((s) => s.settings.monoFontFamily);

  // Poll for foreground process name + Claude status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const name = await invoke<string | null>("get_foreground_process", {
          tabId,
        });
        if (!name) return;

        const status = await invoke<ClaudeStatus | null>("get_claude_status", {
          tabId,
        });
        if (status) {
          const label =
            status.status === "active"
              ? "Claude Code"
              : `Claude Code (${status.status})`;
          dispatch({ type: "tab-update-title", tabId, title: label });
        } else {
          dispatch({ type: "tab-update-title", tabId, title: name });
        }
      } catch {
        /* PTY may not be ready yet */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [tabId]);

  // Initialize terminal + PTY
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: buildFontStack(monoFont, DEFAULT_MONO_FONT_STACK),
      theme: activeTheme.terminal,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    term.focus();
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const unlisten = window.electronAPI.on(
      `pty-output-${tabId}`,
      (data: unknown) => {
        term.write(data as string);
      },
    );

    invoke("spawn_shell", {
      tabId,
      cwd: cwd ?? null,
      initialCommand: initialCommand ?? null,
    });

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
    ro.observe(containerRef.current);

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
    // One-time init per terminal instance — theme and font are synced via separate
    // effects below; cwd / initialCommand are only used at spawn time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Sync theme
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = activeTheme.terminal;
    }
  }, [activeTheme]);

  // Sync mono font
  useEffect(() => {
    const term = termRef.current;
    const fit = fitAddonRef.current;
    if (!term || !fit) return;
    term.options.fontFamily = buildFontStack(monoFont, DEFAULT_MONO_FONT_STACK);
    requestAnimationFrame(() => {
      fit.fit();
      invoke("resize_pty", { tabId, cols: term.cols, rows: term.rows });
    });
  }, [monoFont, tabId]);

  // Refit on active
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

  return { containerRef };
}
