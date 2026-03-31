import { useRef, useEffect } from "react";
import { useClaudeSession } from "@/hooks/useClaudeSession";
import { ClaudeHeader } from "./ClaudeHeader";
import { ClaudeMessageList } from "./ClaudeMessageList";
import { ClaudePermissionPrompt } from "./ClaudePermissionPrompt";
import { ClaudeInputBar } from "./ClaudeInputBar";
import { ClaudeSettingsBar } from "./ClaudeSettingsBar";
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages, conversation.status]);

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
      </div>

      {isWaitingPermission && conversation.pendingPermission && (
        <ClaudePermissionPrompt
          request={conversation.pendingPermission}
          onRespond={respondPermission}
        />
      )}

      <ClaudeInputBar
        onSend={handleSend}
        disabled={conversation.status === "streaming" || isWaitingPermission}
        placeholder={
          hasSession ? "Send a follow-up..." : "Ask Claude something..."
        }
        slashCommands={conversation.slashCommands}
      />

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
