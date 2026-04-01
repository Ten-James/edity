import { useState } from "react";
import { IconCheck, IconArrowUp } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface GitCommitPanelProps {
  stagedCount: number;
  isCommitting: boolean;
  onCommit: (message: string) => Promise<unknown>;
  ahead: number;
  isPushing: boolean;
  onPush: () => Promise<void>;
}

export function GitCommitPanel({
  stagedCount,
  isCommitting,
  onCommit,
  ahead,
  isPushing,
  onPush,
}: GitCommitPanelProps) {
  const [message, setMessage] = useState("");

  const handleCommit = async () => {
    if (!message.trim() || stagedCount === 0) return;
    const result = (await onCommit(message.trim())) as {
      ok: boolean;
      hash?: string;
      error?: string;
    };
    if (result.ok) {
      toast.success("Committed: " + (result.hash ?? ""));
      setMessage("");
    } else {
      toast.error(result.error ?? "Commit failed");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  const hasChangesToCommit = stagedCount > 0;
  const hasCommitsToPush = ahead > 0;

  return (
    <div className="border-t border-border p-2 flex flex-col gap-2">
      {hasChangesToCommit && (
        <>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Commit message..."
            className="min-h-[60px] max-h-[120px] text-xs resize-none"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 gap-1 text-xs"
              disabled={!message.trim() || isCommitting}
              onClick={handleCommit}
            >
              <IconCheck size={14} />
              {isCommitting
                ? "Committing..."
                : `Commit (${stagedCount} file${stagedCount !== 1 ? "s" : ""})`}
            </Button>
            {hasCommitsToPush && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
                disabled={isPushing}
                onClick={onPush}
              >
                <IconArrowUp size={14} />
                {ahead}
              </Button>
            )}
          </div>
        </>
      )}
      {!hasChangesToCommit && hasCommitsToPush && (
        <Button
          size="sm"
          className="w-full gap-1 text-xs"
          disabled={isPushing}
          onClick={onPush}
        >
          <IconArrowUp size={14} />
          {isPushing
            ? "Pushing..."
            : `Push (${ahead} commit${ahead !== 1 ? "s" : ""})`}
        </Button>
      )}
    </div>
  );
}
