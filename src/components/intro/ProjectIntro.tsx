import {
  IconTerminal2,
  IconSearch,
  IconGitBranch,
  type Icon,
} from "@tabler/icons-react";
import { dispatch } from "@/stores/eventBus";
import { formatKeybinding } from "@/lib/keybindings";
import type { EdityEvent } from "@/stores/events";

interface ProjectIntroProps {
  projectName: string;
}

interface ActionCard {
  icon: Icon;
  title: string;
  description: string;
  keybinding?: string;
  event: EdityEvent;
}

const ACTIONS: ActionCard[] = [
  {
    icon: IconTerminal2,
    title: "New Terminal",
    description: "Open a shell in the project root",
    keybinding: "Mod+t",
    event: { type: "tab-create-terminal" },
  },
  {
    icon: IconSearch,
    title: "Open File",
    description: "Fuzzy-find and open any file",
    keybinding: "Mod+Shift+p",
    event: { type: "ui-open-fuzzy-finder" },
  },
  {
    icon: IconGitBranch,
    title: "Git",
    description: "View changes, branches, and history",
    event: { type: "tab-create-git" },
  },
];

export function ProjectIntro({ projectName }: ProjectIntroProps) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-background p-8">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">
            {projectName}
          </h1>
          <p className="text-xs text-muted-foreground">
            Pick an action to get started, or open any tool from the command
            palette.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ACTIONS.map((action) => (
            <ActionCardButton key={action.title} action={action} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionCardButton({ action }: { action: ActionCard }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={() => dispatch(action.event)}
      className="flex flex-col gap-2 border border-border bg-background p-4 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <Icon size={18} className="text-foreground" />
        {action.keybinding && (
          <kbd className="bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {formatKeybinding(action.keybinding)}
          </kbd>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">
          {action.title}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {action.description}
        </span>
      </div>
    </button>
  );
}
