import { useRef, useEffect, useMemo } from "react";
import { useClaudeSession } from "@/hooks/useClaudeSession";
import { ClaudeHeader } from "./ClaudeHeader";
import { ClaudeMessageList } from "./ClaudeMessageList";
import { ClaudePermissionPrompt } from "./ClaudePermissionPrompt";
import { ClaudeInputBar } from "./ClaudeInputBar";
import { ClaudeSettingsBar } from "./ClaudeSettingsBar";
import { ClaudeTaskPopover } from "./ClaudeTaskPopover";
import { TASK_TOOL_NAMES } from "./ClaudeToolCall";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { IconRobot } from "@tabler/icons-react";

interface ClaudeViewProps {
  isActive: boolean;
  projectPath: string;
}

export function ClaudeView({ isActive, projectPath }: ClaudeViewProps) {
  const {
    conversation,
    sessions,
    startSession,
    sendMessage,
    resumeSession,
    respondPermission,
    interrupt,
    abort,
    setModel,
    setPermissionMode,
    refreshSessions,
  } = useClaudeSession(projectPath);

  const hasSession = conversation.sessionId !== null;
  const isWaitingPermission = conversation.status === "waiting_permission";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.status === "streaming" && scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-slot='scroll-area-viewport']") as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [conversation.messages, conversation.status]);

  const taskTools = useMemo(
    () => conversation.messages.flatMap((m) => m.toolUses.filter((t) => TASK_TOOL_NAMES.has(t.name))),
    [conversation.messages],
  );

  const handleSend = async (text: string) => {
    if (!hasSession) {
      await startSession(text);
    } else {
      await sendMessage(text);
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col bg-background",
        !isActive && "hidden",
      )}
    >
      <ClaudeHeader
        conversation={conversation}
        onInterrupt={interrupt}
        onAbort={abort}
      />

      <div ref={scrollRef} className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {!hasSession && conversation.messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <IconRobot size={48} strokeWidth={1.5} />
                <p className="text-sm">Ask Claude anything about this project</p>
              </div>
            </div>
          ) : (
            <ClaudeMessageList messages={conversation.messages} />
          )}
        </ScrollArea>
      </div>

      {isWaitingPermission && conversation.pendingPermission && (
        <ClaudePermissionPrompt
          request={conversation.pendingPermission}
          onRespond={respondPermission}
        />
      )}

      <div className="relative">
        <ClaudeTaskPopover taskTools={taskTools} />
        <ClaudeInputBar
          onSend={handleSend}
          disabled={conversation.status === "streaming" || isWaitingPermission}
          placeholder={
            hasSession ? "Send a follow-up..." : "Ask Claude something..."
          }
          slashCommands={conversation.slashCommands}
        />
      </div>

      <ClaudeSettingsBar
        conversation={conversation}
        sessions={sessions}
        onModelChange={setModel}
        onModeChange={setPermissionMode}
        onResumeSession={resumeSession}
        onRefreshSessions={refreshSessions}
      />
    </div>
  );
}
