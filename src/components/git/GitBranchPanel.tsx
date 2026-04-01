import { useEffect, useState } from "react";
import {
  IconGitBranch,
  IconTrash,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";

interface GitBranchPanelProps {
  branches: GitBranch[];
  onLoadBranches: () => Promise<void>;
  onSwitch: (branch: string) => Promise<unknown>;
  onCreate: (branch: string, checkout: boolean) => Promise<unknown>;
  onDelete: (branch: string, force?: boolean) => Promise<unknown>;
}

export function GitBranchPanel({
  branches,
  onLoadBranches,
  onSwitch,
  onCreate,
  onDelete,
}: GitBranchPanelProps) {
  const [newBranch, setNewBranch] = useState("");

  useEffect(() => {
    onLoadBranches();
  }, [onLoadBranches]);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const handleCreate = async () => {
    if (!newBranch.trim()) return;
    const result = (await onCreate(newBranch.trim(), true)) as {
      ok: boolean;
      error?: string;
    };
    if (result.ok) {
      toast.success("Created branch: " + newBranch.trim());
      setNewBranch("");
    } else {
      toast.error(result.error ?? "Failed to create branch");
    }
  };

  const handleSwitch = async (branch: string) => {
    const result = (await onSwitch(branch)) as {
      ok: boolean;
      error?: string;
    };
    if (result.ok) {
      toast.success("Switched to " + branch);
    } else {
      toast.error(result.error ?? "Failed to switch branch");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2 flex gap-1">
        <Input
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New branch name..."
          className="h-7 text-xs flex-1"
        />
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!newBranch.trim()}
          onClick={handleCreate}
        >
          <IconPlus size={12} />
          Create
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {localBranches.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Local
              </div>
              {localBranches.map((branch) => (
                <div
                  key={branch.name}
                  className={cn(
                    "group flex items-center gap-1.5 px-2 py-1 text-xs",
                    branch.isCurrent
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent cursor-pointer",
                  )}
                  onClick={() => !branch.isCurrent && handleSwitch(branch.name)}
                >
                  <IconGitBranch size={13} className="shrink-0" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.isCurrent && (
                    <IconCheck size={13} className="shrink-0 text-green-400" />
                  )}
                  {!branch.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const result = (await onDelete(branch.name)) as {
                          ok: boolean;
                          error?: string;
                        };
                        if (result.ok) {
                          toast.success("Deleted branch: " + branch.name);
                        } else {
                          toast.error(
                            result.error ?? "Failed to delete branch",
                          );
                        }
                      }}
                      title="Delete branch"
                    >
                      <IconTrash size={12} />
                    </Button>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {branch.shortHash}
                  </span>
                </div>
              ))}
            </div>
          )}

          {remoteBranches.length > 0 && (
            <div className="mt-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Remote
              </div>
              {remoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"
                >
                  <IconGitBranch size={13} className="shrink-0" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  <span className="font-mono text-[10px]">
                    {branch.shortHash}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
