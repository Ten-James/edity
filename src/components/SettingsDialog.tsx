import { useEffect, useState } from "react";
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
import { useAppContext } from "@/contexts/AppContext";
import { LIGHT_THEMES, DARK_THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import type { ColorTheme } from "@shared/types/settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThemeSwatch({ theme }: { theme: ColorTheme }) {
  const vars = theme.monaco;
  return (
    <div className="flex gap-0.5">
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: vars.bg }} />
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: vars.fg }} />
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: vars.primary }} />
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: vars.accent }} />
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
  const { projects } = useAppContext();

  const [lightTheme, setLightTheme] = useState(settings.lightTheme);
  const [darkTheme, setDarkTheme] = useState(settings.darkTheme);
  const [defaultProjectId, setDefaultProjectId] = useState(settings.defaultProjectId);
  const [showChatAvatars, setShowChatAvatars] = useState(settings.claude.showChatAvatars);
  useEffect(() => {
    if (open) {
      setLightTheme(settings.lightTheme);
      setDarkTheme(settings.darkTheme);
      setDefaultProjectId(settings.defaultProjectId);
      setShowChatAvatars(settings.claude.showChatAvatars);
    }
  }, [open, settings]);

  const handleSave = async () => {
    await updateSettings({
      lightTheme,
      darkTheme,
      defaultProjectId,
      claude: { ...settings.claude, showChatAvatars },
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
            <label className="text-xs font-medium text-muted-foreground">Light Theme</label>
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
            <label className="text-xs font-medium text-muted-foreground">Dark Theme</label>
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

          {/* Claude UI */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Claude</label>
            <div className="flex items-center gap-2 mt-1.5">
              <Checkbox
                id="show-avatars"
                checked={showChatAvatars}
                onCheckedChange={(v) => setShowChatAvatars(v === true)}
              />
              <label htmlFor="show-avatars" className="text-xs cursor-pointer">
                Show avatars in chat
              </label>
            </div>
          </div>

          {/* Default project */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Default Project</label>
            <Select
              value={defaultProjectId ?? "none"}
              onValueChange={(v) => setDefaultProjectId(v === "none" ? null : v)}
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
