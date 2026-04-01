import type { ClaudeUIMessage } from "@/types/claude";
import { ClaudeMessageBubble } from "./ClaudeMessageBubble";
import { TASK_TOOL_NAMES } from "./ClaudeToolCall";

interface ClaudeMessageListProps {
  messages: ClaudeUIMessage[];
}

function isMessageEmpty(msg: ClaudeUIMessage): boolean {
  if (msg.isStreaming) return false;
  if (msg.error) return false;
  const visibleTools = msg.toolUses.filter((t) => !TASK_TOOL_NAMES.has(t.name));
  return !msg.textContent && !msg.thinkingContent && visibleTools.length === 0;
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
