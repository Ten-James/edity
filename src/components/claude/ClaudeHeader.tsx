import type { ClaudeConversation } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { IconPlayerStop, IconTrash } from "@tabler/icons-react";

interface ClaudeHeaderProps {
  conversation: ClaudeConversation;
  onInterrupt: () => void;
  onAbort: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function getSessionName(conversation: ClaudeConversation): string | null {
  const first = conversation.messages.find((m) => m.role === "user");
  if (!first?.textContent) return null;
  const text = first.textContent.trim();
  return text.length > 60 ? text.slice(0, 60) + "..." : text;
}

export function ClaudeHeader({
  conversation,
  onInterrupt,
  onAbort,
}: ClaudeHeaderProps) {
  const isActive =
    conversation.status === "streaming" ||
    conversation.status === "waiting_permission";

  const sessionName = getSessionName(conversation);
  const contextWindow = conversation.usage?.contextWindow;
  const totalTokens = conversation.usage
    ? conversation.usage.inputTokens + conversation.usage.outputTokens
    : null;

  return (
    <div className="flex h-9 items-center gap-2 border-b border-border px-2 shrink-0">
      {sessionName && (
        <span className="text-xs text-muted-foreground truncate flex-1">
          {sessionName}
        </span>
      )}
      {!sessionName && <div className="flex-1" />}

      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        {contextWindow != null && contextWindow > 0 && totalTokens != null && (
          <span>
            {formatTokens(totalTokens)}/{formatTokens(contextWindow)}
          </span>
        )}
        {conversation.totalCost > 0 && (
          <span>${conversation.totalCost.toFixed(4)}</span>
        )}
      </div>

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
