import type { RefObject } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { COMMANDS, type CommandContext } from "@/lib/commands";
import { formatKeybinding, getEffectiveKeybinding } from "@/lib/keybindings";
import { useTheme } from "@/components/theme/ThemeProvider";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commandCtx: RefObject<CommandContext>;
}

export function CommandPalette({ open, onOpenChange, commandCtx }: CommandPaletteProps) {
  const { settings } = useTheme();
  const ctx = commandCtx.current;

  const visibleCommands = COMMANDS.filter(
    (cmd) => cmd.id !== "palette.open" && (!cmd.when || cmd.when(ctx)),
  );

  const grouped = new Map<string, typeof visibleCommands>();
  for (const cmd of visibleCommands) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  function handleSelect(cmdId: string) {
    const cmd = COMMANDS.find((c) => c.id === cmdId);
    if (!cmd) return;
    onOpenChange(false);
    requestAnimationFrame(() => cmd.execute(commandCtx.current));
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No commands found</CommandEmpty>
        {Array.from(grouped.entries()).map(([category, cmds]) => (
          <CommandGroup key={category} heading={category}>
            {cmds.map((cmd) => {
              const binding = getEffectiveKeybinding(cmd, settings.keybindings);
              return (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.category} ${cmd.label}`}
                  onSelect={() => handleSelect(cmd.id)}
                >
                  {cmd.icon && <cmd.icon size={16} />}
                  <span>{cmd.label}</span>
                  {binding && (
                    <CommandShortcut>{formatKeybinding(binding)}</CommandShortcut>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
