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
    // setTimeout(0), not requestAnimationFrame: rAF runs inside the same
    // frame *before* React flushes effect cleanups, so the command would
    // execute while the Radix Dialog is still mounted and react-remove-scroll
    // still has `pointer-events: none` / `aria-hidden` applied to body+root.
    // That broke `debug.create-bug-report` (polluted DOM snapshot) and is a
    // latent hazard for any command that inspects the DOM or opens a new
    // focus target. A macrotask runs after React's synchronous flush.
    setTimeout(() => cmd.execute(), 0);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      // Override the dialog's default `sm:max-w-sm` (384px) — far too
      // narrow for a palette listing keybindings + categories.
      className="sm:max-w-2xl"
    >
      <CommandInput placeholder="Search commands..." />
      <CommandList className="max-h-[480px]">
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
