import { useState } from "react";
import type { ClaudeUIMessage } from "@/types/claude";
import { ClaudeToolCall } from "./ClaudeToolCall";
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
}

export function ClaudeMessageBubble({ message }: ClaudeMessageBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <IconUser size={14} className="text-primary" />
        </div>
        <div className="flex-1 pt-0.5">
          <p className="text-sm whitespace-pre-wrap">{message.textContent}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
        {message.isStreaming ? (
          <IconLoader2 size={14} className="animate-spin text-muted-foreground" />
        ) : (
          <IconRobot size={14} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Thinking block */}
        {message.thinkingContent && (
          <button
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
          </button>
        )}
        {thinkingOpen && message.thinkingContent && (
          <div className="mb-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
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
          message.toolUses.length === 0 && (
            <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 rounded-sm" />
          )}

        {/* Tool calls */}
        {message.toolUses.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {message.toolUses.map((toolUse) => (
              <ClaudeToolCall key={toolUse.id} toolUse={toolUse} />
            ))}
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {message.error}
          </div>
        )}
      </div>
    </div>
  );
}
