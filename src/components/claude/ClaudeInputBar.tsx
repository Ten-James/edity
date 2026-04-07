import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BUILTIN_COMMANDS = [
  "bug",
  "clear",
  "compact",
  "config",
  "context",
  "cost",
  "diff",
  "doctor",
  "fast",
  "help",
  "init",
  "login",
  "logout",
  "memory",
  "model",
  "permissions",
  "pr-comments",
  "review",
  "search",
  "status",
  "terminal-setup",
  "vim",
];

interface ClaudeInputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  slashCommands?: string[];
}

export function ClaudeInputBar({
  onSend,
  disabled,
  placeholder,
  slashCommands = [],
}: ClaudeInputBarProps) {
  const [value, setValue] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandsRef = useRef<HTMLDivElement>(null);

  const allCommands =
    slashCommands.length > 0 ? slashCommands : BUILTIN_COMMANDS;
  const filteredCommands = allCommands.filter((cmd) =>
    cmd.toLowerCase().includes(commandFilter.toLowerCase()),
  );

  // Update command-palette state in response to value changes.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value.startsWith("/") && !value.includes(" ")) {
      setShowCommands(true);
      setCommandFilter(value.slice(1));
      setSelectedIdx(0);
    } else {
      setShowCommands(false);
    }
  }

  const insertCommand = (cmd: string) => {
    setValue(`/${cmd} `);
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(filteredCommands[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="relative border-t border-border p-3">
      {showCommands && filteredCommands.length > 0 && (
        <div
          ref={commandsRef}
          className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-auto border border-border bg-popover p-1 shadow-md"
        >
          {filteredCommands.map((cmd, i) => (
            <Button
              key={cmd}
              variant="ghost"
              size="xs"
              onClick={() => insertCommand(cmd)}
              className={cn(
                "w-full justify-start",
                i === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              /{cmd}
            </Button>
          ))}
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="resize-none max-h-[200px] text-sm"
      />
    </div>
  );
}
