import { useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pairBranches, groupPairsByPrefix } from "@/lib/branch-utils";
import { BranchPairGroup } from "./BranchPairGroup";
import type { GitBranch } from "@/types/git";

interface GitBranchPanelProps {
  branches: GitBranch[];
  onLoadBranches: () => Promise<void>;
  onSwitch: (branch: string) => Promise<unknown>;
  onCreate: (branch: string, checkout: boolean) => Promise<unknown>;
  onDelete: (branch: string, force?: boolean) => Promise<unknown>;
  onRename: (oldName: string, newName: string) => Promise<unknown>;
  onDeleteRemote: (remote: string, branch: string) => Promise<unknown>;
  onPush: () => Promise<unknown>;
  onPull: () => Promise<unknown>;
}

export function GitBranchPanel({
  branches,
  onLoadBranches,
  onSwitch,
  onCreate,
  onDelete,
  onRename,
  onDeleteRemote,
  onPush,
  onPull,
}: GitBranchPanelProps) {
  const [newBranch, setNewBranch] = useState("");
  const [renaming, setRenaming] = useState<{
    name: string;
    newName: string;
  } | null>(null);

  useEffect(() => {
    onLoadBranches();
  }, [onLoadBranches]);

  const pairs = pairBranches(branches);
  const groups = groupPairsByPrefix(pairs);

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

  const handleDelete = async (branch: string, force?: boolean) => {
    const result = (await onDelete(branch, force)) as {
      ok: boolean;
      error?: string;
    };
    if (result.ok) {
      toast.success("Deleted branch: " + branch);
    } else {
      toast.error(result.error ?? "Failed to delete branch");
    }
  };

  const handleDeleteRemote = async (remote: string, branch: string) => {
    const result = (await onDeleteRemote(remote, branch)) as {
      ok: boolean;
      error?: string;
    };
    if (result.ok) {
      toast.success(`Deleted ${remote}/${branch}`);
    } else {
      toast.error(result.error ?? "Failed to delete remote branch");
    }
  };

  const handleRenameStart = (branch: GitBranch) => {
    setRenaming({ name: branch.name, newName: branch.name });
  };

  const handleRenameSubmit = async () => {
    if (!renaming || !renaming.newName.trim()) {
      setRenaming(null);
      return;
    }
    if (renaming.newName.trim() === renaming.name) {
      setRenaming(null);
      return;
    }
    const result = (await onRename(renaming.name, renaming.newName.trim())) as {
      ok: boolean;
      error?: string;
    };
    if (result.ok) {
      toast.success(`Renamed to ${renaming.newName.trim()}`);
    } else {
      toast.error(result.error ?? "Failed to rename branch");
    }
    setRenaming(null);
  };

  const handlePush = async () => {
    const result = (await onPush()) as { ok: boolean; error?: string };
    if (result.ok) {
      toast.success("Pushed");
    } else {
      toast.error(result.error ?? "Failed to push");
    }
  };

  const handlePull = async () => {
    const result = (await onPull()) as { ok: boolean; error?: string };
    if (result.ok) {
      toast.success("Pulled");
    } else {
      toast.error(result.error ?? "Failed to pull");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
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

      <div className="grid grid-cols-[1fr_auto_1fr] px-2 py-1 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Local
        </span>
        <div className="w-5" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Remote
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1 space-y-1">
          {groups.map((group) => (
            <BranchPairGroup
              key={group.prefix || "__ungrouped"}
              group={group}
              onSwitch={handleSwitch}
              onRename={handleRenameStart}
              onDelete={handleDelete}
              onDeleteRemote={handleDeleteRemote}
              onPush={handlePush}
              onPull={handlePull}
            />
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename branch</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameSubmit();
            }}
          >
            <Input
              autoFocus
              value={renaming?.newName ?? ""}
              onChange={(e) =>
                setRenaming((prev) =>
                  prev ? { ...prev, newName: e.target.value } : null,
                )
              }
              className="h-7 text-xs"
            />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
