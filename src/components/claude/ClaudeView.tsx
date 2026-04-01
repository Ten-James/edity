import { useRef, useEffect, useState } from "react";
import { useClaudeSession } from "@/hooks/useClaudeSession";
import { ClaudeHeader } from "./ClaudeHeader";
import { ClaudeMessageList } from "./ClaudeMessageList";
import { ClaudePermissionPrompt } from "./ClaudePermissionPrompt";
import { ClaudeQuestionPrompt } from "./ClaudeQuestionPrompt";
import { ClaudeInputBar } from "./ClaudeInputBar";
import { ClaudeSettingsBar } from "./ClaudeSettingsBar";
import { ClaudeTaskPopover } from "./ClaudeTaskPopover";
import { TASK_TOOL_NAMES } from "./ClaudeToolCall";
import { cn } from "@/lib/utils";
import { IconRobot, IconLoader2 } from "@tabler/icons-react";

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
    answerQuestion,
    interrupt,
    abort,
    setModel,
    setPermissionMode,
    refreshSessions,
  } = useClaudeSession(projectPath);

  const hasSession = conversation.sessionId !== null;
  const isBusy =
    conversation.status === "streaming" ||
    conversation.status === "waiting_permission";
  const isWaitingPermission = conversation.status === "waiting_permission";
  const scrollRef = useRef<HTMLDivElement>(null);

  // Elapsed time tracking
  const [streamStart, setStreamStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (isBusy && !streamStart) {
      setStreamStart(Date.now());
    } else if (!isBusy && streamStart) {
      setStreamStart(null);
    }
  }, [isBusy, streamStart]);

  useEffect(() => {
    if (!streamStart) {
      setElapsed("");
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - streamStart) / 1000);
      setElapsed(s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [streamStart]);

  useEffect(() => {
    if (conversation.status === "streaming" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages, conversation.status]);

  const taskTools = conversation.messages.flatMap((m) =>
    m.toolUses.filter((t) => TASK_TOOL_NAMES.has(t.name)),
  );

  const handleSend = async (text: string) => {
    if (!hasSession) {
      await startSession(text);
    } else {
      await sendMessage(text);
    }
  };

  const handleAnswerQuestion = async (answers: Record<string, string>) => {
    const q = conversation.pendingQuestion;
    if (!q) return;
    await answerQuestion(q.toolUseID, answers);
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

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
      >
        {!hasSession && conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <IconRobot size={48} strokeWidth={1.5} />
              <p className="text-sm">Ask Claude anything about this project</p>
            </div>
          </div>
        ) : (
          <>
            <ClaudeMessageList messages={conversation.messages} />
            {isBusy && !conversation.pendingQuestion && (
              <div className="flex items-center gap-2 px-4 pb-4 text-xs text-muted-foreground">
                <IconLoader2 size={12} className="animate-spin" />
                <span>
                  {conversation.status === "waiting_permission"
                    ? "Waiting for approval"
                    : conversation.sessionState === "compacting"
                      ? "Compacting context..."
                      : "Working"}
                </span>
                {elapsed && <span>{elapsed}</span>}
                {conversation.numTurns > 0 && (
                  <span>{conversation.numTurns}t</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isWaitingPermission && conversation.pendingPermission && (
        <ClaudePermissionPrompt
          request={conversation.pendingPermission}
          onRespond={respondPermission}
        />
      )}

      <div className="relative">
        <ClaudeTaskPopover taskTools={taskTools} />
        {conversation.pendingQuestion ? (
          <ClaudeQuestionPrompt
            pendingQuestion={conversation.pendingQuestion}
            onAnswer={handleAnswerQuestion}
          />
        ) : (
          <ClaudeInputBar
            onSend={handleSend}
            disabled={conversation.status === "streaming" || isWaitingPermission}
            placeholder={
              hasSession ? "Send a follow-up..." : "Ask Claude something..."
            }
            slashCommands={conversation.slashCommands}
          />
        )}
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
