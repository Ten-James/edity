import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { COMMANDS } from "@/lib/commands";
import { formatKeybinding, getEffectiveKeybinding } from "@/lib/keybindings";
import { useSettingsStore } from "@/stores/settingsStore";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const keybindings = useSettingsStore((s) => s.settings.keybindings);

  const visibleCommands = COMMANDS.filter(
    (cmd) => cmd.id !== "palette.open" && (!cmd.when || cmd.when()),
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
    requestAnimationFrame(() => cmd.execute());
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No commands found</CommandEmpty>
        {Array.from(grouped.entries()).map(([category, cmds]) => (
          <CommandGroup key={category} heading={category}>
            {cmds.map((cmd) => {
              const binding = getEffectiveKeybinding(cmd, keybindings);
              return (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.category} ${cmd.label}`}
                  onSelect={() => handleSelect(cmd.id)}
                >
                  {cmd.icon && <cmd.icon size={16} />}
                  <span>{cmd.label}</span>
                  {binding && (
                    <CommandShortcut>
                      {formatKeybinding(binding)}
                    </CommandShortcut>
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
