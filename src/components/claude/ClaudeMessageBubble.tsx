import { useState } from "react";
import type { ClaudeUIMessage } from "@/types/claude";
import { ClaudeToolCall, TASK_TOOL_NAMES } from "./ClaudeToolCall";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  IconUser,
  IconRobot,
  IconBrain,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
} from "@tabler/icons-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ClaudeMessageBubbleProps {
  message: ClaudeUIMessage;
  onSendMessage?: (text: string) => void;
}

export function ClaudeMessageBubble({ message, onSendMessage }: ClaudeMessageBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const { settings } = useTheme();
  const autoExpandSet = new Set(settings.claude.autoExpandTools);
  const showAvatars = settings.claude.showChatAvatars;

  const visibleToolUses = message.toolUses.filter((t) => !TASK_TOOL_NAMES.has(t.name));

  if (message.role === "user") {
    return (
      <div className="flex gap-3">
        {showAvatars && (
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <IconUser size={10} className="text-primary" />
          </div>
        )}
        <div className="flex-1 pt-0.5">
          <p className="text-sm whitespace-pre-wrap">{message.textContent}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {showAvatars && (
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent">
          {message.isStreaming ? (
            <IconLoader2 size={10} className="animate-spin text-muted-foreground" />
          ) : (
            <IconRobot size={10} className="text-muted-foreground" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Thinking block */}
        {message.thinkingContent && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setThinkingOpen((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconBrain size={12} />
            {thinkingOpen ? (
              <IconChevronDown size={12} />
            ) : (
              <IconChevronRight size={12} />
            )}
            <span>Thinking</span>
          </Button>
        )}
        {thinkingOpen && message.thinkingContent && (
          <div className="mb-3 border border-border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {message.thinkingContent}
          </div>
        )}

        {/* Text content with markdown */}
        {message.textContent && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-xs [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
            <Markdown remarkPlugins={[remarkGfm]}>
              {message.textContent}
            </Markdown>
          </div>
        )}

        {/* Streaming cursor */}
        {message.isStreaming &&
          !message.textContent &&
          visibleToolUses.length === 0 && (
            <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50" />
          )}

        {/* Tool calls */}
        {visibleToolUses.length > 0 && (
          <div className="flex flex-col gap-2">
            {visibleToolUses.map((toolUse) => (
              <ClaudeToolCall key={toolUse.id} toolUse={toolUse} autoExpand={autoExpandSet.has(toolUse.name)} onAnswer={onSendMessage} />
            ))}
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="mt-2 border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {message.error}
          </div>
        )}
      </div>
    </div>
  );
}
