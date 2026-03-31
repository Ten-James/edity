import type { ClaudeUIMessage } from "@/types/claude";
import { ClaudeMessageBubble } from "./ClaudeMessageBubble";

interface ClaudeMessageListProps {
  messages: ClaudeUIMessage[];
}

function isMessageEmpty(msg: ClaudeUIMessage): boolean {
  if (msg.isStreaming) return false;
  if (msg.error) return false;
  return (
    !msg.textContent &&
    !msg.thinkingContent &&
    msg.toolUses.length === 0
  );
}

export function ClaudeMessageList({ messages }: ClaudeMessageListProps) {
  const visible = messages.filter((m) => !isMessageEmpty(m));

  return (
    <div className="flex flex-col gap-2 p-4">
      {visible.map((message) => (
        <ClaudeMessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
