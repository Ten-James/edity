import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface GitCommitPanelProps {
  stagedCount: number;
  isCommitting: boolean;
  onCommit: (message: string) => Promise<unknown>;
}

export function GitCommitPanel({
  stagedCount,
  isCommitting,
  onCommit,
}: GitCommitPanelProps) {
  const [message, setMessage] = useState("");

  const handleCommit = async () => {
    if (!message.trim() || stagedCount === 0) return;
    await onCommit(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="border-t border-border p-2 flex flex-col gap-2">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Commit message..."
        className="min-h-[60px] max-h-[120px] text-xs resize-none"
      />
      <Button
        size="sm"
        className="w-full gap-1 text-xs"
        disabled={!message.trim() || stagedCount === 0 || isCommitting}
        onClick={handleCommit}
      >
        <IconCheck size={14} />
        {isCommitting
          ? "Committing..."
          : `Commit (${stagedCount} file${stagedCount !== 1 ? "s" : ""})`}
      </Button>
    </div>
  );
}
