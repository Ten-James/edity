import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext, type EdityConfig } from "@/contexts/AppContext";
import { cn, PROJECT_COLORS, COLOR_KEYS } from "@/lib/utils";

interface SetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: EdityConfig | null;
  projectPath: string;
}

export function SetupDialog({
  open,
  onOpenChange,
  initialConfig,
  projectPath,
}: SetupDialogProps) {
  const { saveEdityConfig } = useAppContext();

  const [acronym, setAcronym] = useState("");
  const [color, setColor] = useState<string>("blue");
  const [runCommand, setRunCommand] = useState("");
  const [runMode, setRunMode] = useState<"terminal" | "background">("terminal");

  useEffect(() => {
    if (open) {
      setAcronym(initialConfig?.acronym ?? "");
      setColor(initialConfig?.color ?? "blue");
      setRunCommand(initialConfig?.runCommand ?? "");
      setRunMode(initialConfig?.runMode ?? "terminal");
    }
  }, [open, initialConfig]);

  const handleSave = async () => {
    const config: EdityConfig = {};
    if (acronym.trim()) config.acronym = acronym.trim().toUpperCase();
    if (color) config.color = color;
    if (runCommand.trim()) config.runCommand = runCommand.trim();
    config.runMode = runMode;

    await saveEdityConfig(config, projectPath);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Project Setup</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
              style={{
                backgroundColor: PROJECT_COLORS[color]?.hex ?? PROJECT_COLORS.blue.hex,
                color: PROJECT_COLORS[color]?.textHex ?? "#fff",
              }}
            >
              {acronym.toUpperCase() || "??"}
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Acronym</label>
              <Input
                value={acronym}
                onChange={(e) =>
                  setAcronym(e.target.value.toUpperCase().slice(0, 3))
                }
                placeholder="ED"
                maxLength={3}
                className="h-8"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Color</label>
            <div className="flex gap-2 mt-1">
              {COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => setColor(key)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-all",
                    color === key && "ring-2 ring-offset-2 ring-offset-background ring-foreground",
                  )}
                  style={{ backgroundColor: PROJECT_COLORS[key].hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Run Command</label>
            <Input
              value={runCommand}
              onChange={(e) => setRunCommand(e.target.value)}
              placeholder="npm run dev"
              className="h-8"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Run Mode</label>
            <div className="flex gap-1 mt-1">
              <Button
                type="button"
                size="sm"
                variant={runMode === "terminal" ? "default" : "outline"}
                className="flex-1 h-8 text-xs"
                onClick={() => setRunMode("terminal")}
              >
                Terminal
              </Button>
              <Button
                type="button"
                size="sm"
                variant={runMode === "background" ? "default" : "outline"}
                className="flex-1 h-8 text-xs"
                onClick={() => setRunMode("background")}
              >
                Background
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
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
