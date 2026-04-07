import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorktreeAndOpenTerminal } from "@/stores/worktreeEffect";

interface WorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeDialog({ open, onOpenChange }: WorktreeDialogProps) {
  const [branch, setBranch] = useState("");
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = branch.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      await createWorktreeAndOpenTerminal(trimmed, command.trim() || undefined);
      onOpenChange(false);
      setBranch("");
      setCommand("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Git Worktree</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Branch name</span>
            <Input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/my-branch"
              autoFocus
              disabled={loading}
            />
            <span className="text-xs text-muted-foreground">
              Creates a new branch if it doesn't exist yet
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Initial command (optional)</span>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm install && npm run dev"
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!branch.trim() || loading}>
              {loading ? "Creating..." : "Create Worktree"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
