import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useProjectStore } from "@/stores/projectStore";
import { LIGHT_THEMES, DARK_THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { KeybindingsSettings } from "@/components/KeybindingsSettings";
import { FontPicker } from "@/components/settings/FontPicker";
import type { ColorTheme } from "@shared/types/settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThemeSwatch({ theme }: { theme: ColorTheme }) {
  const vars = theme.monaco;
  return (
    <div className="flex gap-0.5">
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: vars.bg }}
      />
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: vars.fg }}
      />
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: vars.primary }}
      />
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: vars.accent }}
      />
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  onClick,
}: {
  theme: ColorTheme;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 border p-2 text-left text-xs transition-all hover:bg-accent",
        selected
          ? "border-primary ring-1 ring-primary bg-accent"
          : "border-border",
      )}
    >
      <ThemeSwatch theme={theme} />
      <span className="truncate font-medium">{theme.name}</span>
    </button>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings } = useTheme();
  const projects = useProjectStore((s) => s.projects);

  const [lightTheme, setLightTheme] = useState(settings.lightTheme);
  const [darkTheme, setDarkTheme] = useState(settings.darkTheme);
  const [defaultProjectId, setDefaultProjectId] = useState(
    settings.defaultProjectId,
  );
  const [showChatAvatars, setShowChatAvatars] = useState(
    settings.claude.showChatAvatars,
  );
  const [coloredBgForClaude, setColoredBgForClaude] = useState(
    settings.claude.coloredBgForClaude ?? false,
  );
  const [keybindings, setKeybindings] = useState<Record<string, string>>(
    settings.keybindings,
  );
  const [uiFontFamily, setUiFontFamily] = useState(settings.uiFontFamily);
  const [monoFontFamily, setMonoFontFamily] = useState(settings.monoFontFamily);
  const [monoFontLigatures, setMonoFontLigatures] = useState(
    settings.monoFontLigatures,
  );
  // Reset form to current settings each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLightTheme(settings.lightTheme);
      setDarkTheme(settings.darkTheme);
      setDefaultProjectId(settings.defaultProjectId);
      setShowChatAvatars(settings.claude.showChatAvatars);
      setColoredBgForClaude(settings.claude.coloredBgForClaude ?? false);
      setKeybindings(settings.keybindings);
      setUiFontFamily(settings.uiFontFamily);
      setMonoFontFamily(settings.monoFontFamily);
      setMonoFontLigatures(settings.monoFontLigatures);
    }
  }

  const handleSave = async () => {
    await updateSettings({
      lightTheme,
      darkTheme,
      defaultProjectId,
      claude: { ...settings.claude, showChatAvatars, coloredBgForClaude },
      keybindings,
      uiFontFamily,
      monoFontFamily,
      monoFontLigatures,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="flex flex-col gap-5 py-2">
            {/* Light theme */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Light Theme
              </label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {LIGHT_THEMES.map((t) => (
                  <ThemeCard
                    key={t.id}
                    theme={t}
                    selected={lightTheme === t.id}
                    onClick={() => setLightTheme(t.id)}
                  />
                ))}
              </div>
            </div>

            {/* Dark theme */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Dark Theme
              </label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {DARK_THEMES.map((t) => (
                  <ThemeCard
                    key={t.id}
                    theme={t}
                    selected={darkTheme === t.id}
                    onClick={() => setDarkTheme(t.id)}
                  />
                ))}
              </div>
            </div>

            {/* Interface font */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Interface Font
              </label>
              <div className="mt-1.5">
                <FontPicker
                  value={uiFontFamily}
                  onChange={setUiFontFamily}
                  placeholder="System default"
                />
              </div>
            </div>

            {/* Editor & terminal font */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Editor & Terminal Font
              </label>
              <div className="mt-1.5">
                <FontPicker
                  value={monoFontFamily}
                  onChange={setMonoFontFamily}
                  monoOnly
                  placeholder="System default"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id="mono-font-ligatures"
                  checked={monoFontLigatures}
                  onCheckedChange={(v) => setMonoFontLigatures(v === true)}
                />
                <label
                  htmlFor="mono-font-ligatures"
                  className="cursor-pointer text-xs"
                >
                  Enable font ligatures (joins{" "}
                  <code className="font-mono">=&gt;</code>,{" "}
                  <code className="font-mono">!=</code>, etc. — editor only)
                </label>
              </div>
            </div>

            {/* Claude UI */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Claude
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <Checkbox
                  id="show-avatars"
                  checked={showChatAvatars}
                  onCheckedChange={(v) => setShowChatAvatars(v === true)}
                />
                <label
                  htmlFor="show-avatars"
                  className="text-xs cursor-pointer"
                >
                  Show avatars in chat
                </label>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  id="colored-bg-claude"
                  checked={coloredBgForClaude}
                  onCheckedChange={(v) => setColoredBgForClaude(v === true)}
                />
                <label
                  htmlFor="colored-bg-claude"
                  className="text-xs cursor-pointer"
                >
                  Colored background for Claude (tint terminal with status
                  color)
                </label>
              </div>
            </div>

            {/* Default project */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Default Project
              </label>
              <Select
                value={defaultProjectId ?? "none"}
                onValueChange={(v) =>
                  setDefaultProjectId(v === "none" ? null : v)
                }
              >
                <SelectTrigger className="mt-1.5 h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Keyboard Shortcuts */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Keyboard Shortcuts
              </label>
              <div className="mt-1.5">
                <KeybindingsSettings
                  keybindings={keybindings}
                  onChange={setKeybindings}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
