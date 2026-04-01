import { useState } from "react";
import type { ClaudeUIMessage } from "@/types/claude";
import { ClaudeToolCall, TASK_TOOL_NAMES, INLINE_TOOLS } from "./ClaudeToolCall";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ClaudeToolUse } from "@/types/claude";
import {
  IconUser,
  IconRobot,
  IconBrain,
  IconLoader2,
} from "@tabler/icons-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function groupToolUses(tools: ClaudeToolUse[]): ClaudeToolUse[][] {
  const groups: ClaudeToolUse[][] = [];
  for (const tool of tools) {
    const isInline = INLINE_TOOLS.has(tool.name);
    const last = groups[groups.length - 1];
    if (isInline && last && INLINE_TOOLS.has(last[0].name)) {
      last.push(tool);
    } else {
      groups.push([tool]);
    }
  }
  return groups;
}

interface ClaudeMessageBubbleProps {
  message: ClaudeUIMessage;
}

export function ClaudeMessageBubble({
  message,
}: ClaudeMessageBubbleProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const { settings } = useTheme();
  const autoExpandSet = new Set(settings.claude.autoExpandTools);
  const showAvatars = settings.claude.showChatAvatars;

  const visibleToolUses = message.toolUses.filter(
    (t) => !TASK_TOOL_NAMES.has(t.name),
  );

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
            <IconLoader2
              size={10}
              className="animate-spin text-muted-foreground"
            />
          ) : (
            <IconRobot size={10} className="text-muted-foreground" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Thinking block */}
        {message.thinkingContent && (
          <button
            onClick={() => setThinkingOpen((v) => !v)}
            className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <IconBrain size={11} />
            <span>Thinking</span>
          </button>
        )}
        {thinkingOpen && message.thinkingContent && (
          <div className="mb-2 border-l-2 border-border pl-2.5 text-[11px] text-muted-foreground/70 whitespace-pre-wrap leading-relaxed">
            {message.thinkingContent}
          </div>
        )}

        {/* Text content with markdown */}
        {message.textContent && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed py-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:mb-1 [&_li]:leading-relaxed [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-xs [&_pre]:mb-3 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:mt-2.5 [&_h3]:mb-1.5">
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
            {groupToolUses(visibleToolUses).map((group) =>
              group.length > 1 ? (
                <div key={group[0].id} className="flex flex-col border border-border rounded-sm bg-muted/10 px-2 py-1">
                  {group.map((toolUse) => (
                    <ClaudeToolCall
                      key={toolUse.id}
                      toolUse={toolUse}
                      autoExpand={autoExpandSet.has(toolUse.name)}
                    />
                  ))}
                </div>
              ) : (
                <ClaudeToolCall
                  key={group[0].id}
                  toolUse={group[0]}
                  autoExpand={autoExpandSet.has(group[0].name)}
                />
              ),
            )}
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
