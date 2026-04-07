import { useEffect, useState } from "react";
import { COMMANDS } from "@/lib/commands";
import {
  formatKeybinding,
  getEffectiveKeybinding,
  eventToKeybindingString,
} from "@/lib/keybindings";
import { Button } from "@/components/ui/button";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface KeybindingsSettingsProps {
  keybindings: Record<string, string>;
  onChange: (keybindings: Record<string, string>) => void;
}

export function KeybindingsSettings({
  keybindings,
  onChange,
}: KeybindingsSettingsProps) {
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    // Capture in a const so TypeScript keeps the non-null narrowing inside the handler.
    const id = recordingId;

    function handler(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        onChange({ ...keybindings, [id]: "" });
        setRecordingId(null);
        return;
      }

      const str = eventToKeybindingString(e);
      if (!str) return;

      const cmd = COMMANDS.find((c) => c.id === id);
      if (cmd?.defaultKeybinding === str) {
        const next = { ...keybindings };
        delete next[id];
        onChange(next);
      } else {
        onChange({ ...keybindings, [id]: str });
      }
      setRecordingId(null);
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [recordingId, keybindings, onChange]);

  const grouped = new Map<string, typeof COMMANDS>();
  for (const cmd of COMMANDS) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  function handleReset(cmdId: string) {
    const next = { ...keybindings };
    delete next[cmdId];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from(grouped.entries()).map(([category, cmds]) => (
        <div key={category}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {category}
          </div>
          <div className="flex flex-col">
            {cmds.map((cmd) => {
              const effective = getEffectiveKeybinding(cmd, keybindings);
              const isRecording = recordingId === cmd.id;
              const isOverridden = cmd.id in keybindings;

              return (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between py-1 px-1 -mx-1 rounded-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 text-xs min-w-0">
                    {cmd.icon && (
                      <span className="shrink-0 text-muted-foreground">
                        <cmd.icon size={14} />
                      </span>
                    )}
                    <span className="truncate">{cmd.label}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() =>
                        setRecordingId(isRecording ? null : cmd.id)
                      }
                      className={cn(
                        "h-6 min-w-[80px] px-2 text-[11px] border rounded-sm text-center transition-colors",
                        isRecording
                          ? "border-primary bg-primary/10 text-primary animate-pulse"
                          : effective
                            ? "border-border bg-muted/50 text-foreground"
                            : "border-dashed border-border text-muted-foreground",
                      )}
                    >
                      {isRecording
                        ? "Press keys..."
                        : effective
                          ? formatKeybinding(effective)
                          : "None"}
                    </button>

                    {isOverridden && !isRecording && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5"
                        onClick={() => handleReset(cmd.id)}
                        title="Reset to default"
                      >
                        <IconX size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">
        Click a shortcut to record new keys. Press Escape to cancel, Backspace
        to clear.
      </p>
    </div>
  );
}
