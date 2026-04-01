import { useTerminal } from "@/hooks/useTerminal";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  tabId: string;
  isActive: boolean;
  cwd?: string;
  initialCommand?: string;
}

export function TerminalView({
  tabId,
  isActive,
  cwd,
  initialCommand,
}: TerminalViewProps) {
  const { containerRef } = useTerminal({
    tabId,
    isActive,
    cwd,
    initialCommand,
  });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ display: isActive ? "block" : "none" }}
    />
  );
}
