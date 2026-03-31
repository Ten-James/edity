import type { ClaudeConversation } from "@/types/claude";
import { Button } from "@/components/ui/button";
import {
  IconPlayerStop,
  IconTrash,
  IconLoader2,
} from "@tabler/icons-react";

interface ClaudeHeaderProps {
  conversation: ClaudeConversation;
  onInterrupt: () => void;
  onAbort: () => void;
}

export function ClaudeHeader({
  conversation,
  onInterrupt,
  onAbort,
}: ClaudeHeaderProps) {
  const isActive =
    conversation.status === "streaming" ||
    conversation.status === "waiting_permission";

  return (
    <div className="flex h-9 items-center gap-1 border-b border-border px-2 shrink-0">
      <div className="flex-1" />

      {/* Status info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isActive && (
          <span className="flex items-center gap-1">
            <IconLoader2 size={12} className="animate-spin" />
            {conversation.status === "waiting_permission" ? "Approval" : "Working"}
          </span>
        )}
        {conversation.numTurns > 0 && (
          <span>{conversation.numTurns}t</span>
        )}
        {conversation.totalCost > 0 && (
          <span>${conversation.totalCost.toFixed(4)}</span>
        )}
      </div>

      {/* Actions */}
      {isActive && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onInterrupt}
          title="Interrupt"
        >
          <IconPlayerStop size={14} />
        </Button>
      )}
      {conversation.sessionId && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onAbort}
          title="End session"
        >
          <IconTrash size={14} />
        </Button>
      )}
    </div>
  );
}
