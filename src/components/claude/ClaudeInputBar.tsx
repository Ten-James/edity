import { useState, useRef, useCallback, useEffect } from "react";
import { IconSend2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  const filteredCommands = slashCommands.filter((cmd) =>
    cmd.toLowerCase().includes(commandFilter.toLowerCase()),
  );

  // Show command menu when typing /
  useEffect(() => {
    if (value.startsWith("/") && !value.includes(" ")) {
      setShowCommands(true);
      setCommandFilter(value.slice(1));
      setSelectedIdx(0);
    } else {
      setShowCommands(false);
    }
  }, [value]);

  const insertCommand = useCallback(
    (cmd: string) => {
      setValue(`/${cmd} `);
      setShowCommands(false);
      textareaRef.current?.focus();
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

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
      {/* Slash command autocomplete */}
      {showCommands && filteredCommands.length > 0 && (
        <div
          ref={commandsRef}
          className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd}
              onClick={() => insertCommand(cmd)}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-xs",
                i === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              /{cmd}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "max-h-[200px]",
          )}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="h-9 w-9 shrink-0"
        >
          <IconSend2 size={16} />
        </Button>
      </div>
    </div>
  );
}
