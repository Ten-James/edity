import { IconFolderPlus, IconFolder } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { dispatch } from "@/stores/eventBus";
import { formatKeybinding } from "@/lib/keybindings";

const SHORTCUTS: { keybinding: string; label: string }[] = [
  { keybinding: "Mod+p", label: "Command Palette" },
  { keybinding: "Mod+Shift+p", label: "Find in Project" },
  { keybinding: "Mod+,", label: "Settings" },
];

export function GlobalIntro() {
  const projects = useProjectStore((s) => s.projects);

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-background p-8">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Edity</h1>
          <p className="text-sm text-muted-foreground">
            Multi-project terminal, editor, and git IDE.
          </p>
        </div>

        <div>
          <Button
            size="lg"
            onClick={() => dispatch({ type: "project-add" })}
          >
            <IconFolderPlus size={16} />
            Open folder as project
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent projects
            </h2>
            <div className="flex flex-col border border-border">
              {projects.map((project, idx) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() =>
                    dispatch({ type: "project-switch", projectId: project.id })
                  }
                  className={
                    "flex items-center gap-3 p-3 text-left transition-colors hover:bg-accent" +
                    (idx > 0 ? " border-t border-border" : "")
                  }
                >
                  <IconFolder
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium text-foreground">
                      {project.name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {project.path}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shortcuts
          </h2>
          <div className="flex flex-col gap-1.5">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.keybinding}
                className="flex items-center gap-3 text-xs"
              >
                <kbd className="min-w-[3rem] bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                  {formatKeybinding(shortcut.keybinding)}
                </kbd>
                <span className="text-muted-foreground">{shortcut.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
