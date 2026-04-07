import { useState } from "react";
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/stores/projectStore";
import type { EdityConfig, RunCommand } from "@shared/types/project";
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

  const [acronym, setAcronym] = useState("");
  const [color, setColor] = useState<string>("blue");
  const [runCommands, setRunCommands] = useState<RunCommand[]>([]);

  // Reset form to initial config each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAcronym(initialConfig?.acronym ?? "");
      setColor(initialConfig?.color ?? "blue");
      setRunCommands(initialConfig?.runCommands ?? []);
    }
  }

  const handleSave = async () => {
    const config: EdityConfig = {};
    if (acronym.trim()) config.acronym = acronym.trim().toUpperCase();
    if (color) config.color = color;
    const validCommands = runCommands.filter((c) => c.command.trim());
    if (validCommands.length > 0) config.runCommands = validCommands;

    await useProjectStore.getState()._saveConfig(config, projectPath);
    onOpenChange(false);
  };

  const addCommand = () => {
    setRunCommands((prev) => [
      ...prev,
      { name: "", command: "", mode: "terminal" },
    ]);
  };

  const updateCommand = (index: number, updates: Partial<RunCommand>) => {
    setRunCommands((prev) =>
      prev.map((cmd, i) => (i === index ? { ...cmd, ...updates } : cmd)),
    );
  };

  const removeCommand = (index: number) => {
    setRunCommands((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Project Setup</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center text-xs font-bold"
              style={{
                backgroundColor:
                  PROJECT_COLORS[color]?.hex ?? PROJECT_COLORS.blue.hex,
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
                    color === key &&
                      "ring-2 ring-offset-2 ring-offset-background ring-foreground",
                  )}
                  style={{ backgroundColor: PROJECT_COLORS[key].hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">
                Run Commands
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={addCommand}
              >
                <IconPlus size={14} />
              </Button>
            </div>

            {runCommands.length === 0 && (
              <p className="text-xs text-muted-foreground/60 py-2 text-center">
                No run commands configured
              </p>
            )}

            <div className="flex flex-col gap-2">
              {runCommands.map((cmd, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1.5 border border-border p-2"
                >
                  <div className="flex items-center gap-1">
                    <IconGripVertical
                      size={12}
                      className="text-muted-foreground shrink-0"
                    />
                    {i === 0 && (
                      <span className="text-[10px] font-medium text-primary px-1 bg-primary/10 shrink-0">
                        Default
                      </span>
                    )}
                    <Input
                      value={cmd.name}
                      onChange={(e) =>
                        updateCommand(i, { name: e.target.value })
                      }
                      placeholder="Name (e.g. dev)"
                      className="h-6 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeCommand(i)}
                    >
                      <IconTrash size={12} />
                    </Button>
                  </div>
                  <Input
                    value={cmd.command}
                    onChange={(e) =>
                      updateCommand(i, { command: e.target.value })
                    }
                    placeholder="Command (e.g. npm run dev)"
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={cmd.mode === "terminal" ? "default" : "outline"}
                      className="flex-1 h-6 text-[11px]"
                      onClick={() => updateCommand(i, { mode: "terminal" })}
                    >
                      Terminal
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        cmd.mode === "background" ? "default" : "outline"
                      }
                      className="flex-1 h-6 text-[11px]"
                      onClick={() => updateCommand(i, { mode: "background" })}
                    >
                      Background
                    </Button>
                  </div>
                </div>
              ))}
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
