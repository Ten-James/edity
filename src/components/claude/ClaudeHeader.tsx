import { useState, useRef, useEffect } from "react";
import type { ClaudeConversation, ClaudeSessionInfo, PermissionMode } from "@/types/claude";
import { Button } from "@/components/ui/button";
import {
  IconPlayerStop,
  IconTrash,
  IconLoader2,
  IconChevronDown,
  IconHistory,
  IconRefresh,
} from "@tabler/icons-react";

interface ClaudeHeaderProps {
  conversation: ClaudeConversation;
  sessions: ClaudeSessionInfo[];
  onInterrupt: () => void;
  onAbort: () => void;
  onModelChange: (model: string) => void;
  onModeChange: (mode: PermissionMode) => void;
  onResumeSession: (sessionId: string, prompt: string) => void;
  onRefreshSessions: () => void;
}

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const MODES: { value: PermissionMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "plan", label: "Plan" },
  { value: "bypassPermissions", label: "Full Auto" },
  { value: "dontAsk", label: "Don't Ask" },
];

function getModelLabel(model: string | null): string {
  if (!model) return "Sonnet 4.6";
  const found = MODELS.find((m) => model.includes(m.value) || m.value.includes(model));
  return found?.label ?? model;
}

function getModeLabel(mode: PermissionMode): string {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

export function ClaudeHeader({
  conversation,
  sessions,
  onInterrupt,
  onAbort,
  onModelChange,
  onModeChange,
  onResumeSession,
  onRefreshSessions,
}: ClaudeHeaderProps) {
  const isActive =
    conversation.status === "streaming" ||
    conversation.status === "waiting_permission";

  return (
    <div className="flex h-9 items-center gap-1 border-b border-border px-2 shrink-0">
      {/* Model selector */}
      <Dropdown
        label={getModelLabel(conversation.model)}
        items={MODELS.map((m) => ({
          label: m.label,
          active: conversation.model?.includes(m.value) ?? (m.value === "claude-sonnet-4-6" && !conversation.model),
          onSelect: () => onModelChange(m.value),
        }))}
      />

      {/* Mode selector */}
      <Dropdown
        label={getModeLabel(conversation.permissionMode)}
        items={MODES.map((m) => ({
          label: m.label,
          active: conversation.permissionMode === m.value,
          onSelect: () => onModeChange(m.value),
        }))}
      />

      {/* Session history */}
      {sessions.length > 0 && (
        <Dropdown
          icon={<IconHistory size={12} />}
          label="Sessions"
          items={sessions.slice(0, 15).map((s) => ({
            label: s.summary.slice(0, 60),
            active: conversation.sessionId === s.sessionId,
            onSelect: () => onResumeSession(s.sessionId, "Continue from previous session"),
          }))}
          footer={
            <button
              onClick={onRefreshSessions}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <IconRefresh size={12} />
              Refresh
            </button>
          }
        />
      )}

      {/* Spacer */}
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
          size="icon"
          className="h-7 w-7"
          onClick={onInterrupt}
          title="Interrupt"
        >
          <IconPlayerStop size={14} />
        </Button>
      )}
      {conversation.sessionId && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onAbort}
          title="End session"
        >
          <IconTrash size={14} />
        </Button>
      )}
    </div>
  );
}

// --- Generic dropdown used for model, mode, and sessions ---

interface DropdownItem {
  label: string;
  active: boolean;
  onSelect: () => void;
}

interface DropdownProps {
  label: string;
  icon?: React.ReactNode;
  items: DropdownItem[];
  footer?: React.ReactNode;
}

function Dropdown({ label, icon, items, footer }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {icon}
        <span>{label}</span>
        <IconChevronDown size={10} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                item.active ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {item.active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {footer && (
            <>
              <div className="my-1 border-t border-border" />
              {footer}
            </>
          )}
        </div>
      )}
    </div>
  );
}
