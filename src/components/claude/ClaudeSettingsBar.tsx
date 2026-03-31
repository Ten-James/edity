import type { ClaudeConversation, ClaudeSessionInfo, PermissionMode } from "@/types/claude";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  IconChevronDown,
  IconHistory,
  IconRefresh,
  IconCpu,
  IconShield,
  IconEye,
} from "@tabler/icons-react";
import { useTheme } from "@/components/theme/ThemeProvider";

interface ClaudeSettingsBarProps {
  conversation: ClaudeConversation;
  sessions: ClaudeSessionInfo[];
  onModelChange: (model: string) => void;
  onModeChange: (mode: PermissionMode) => void;
  onResumeSession: (sessionId: string) => void;
  onRefreshSessions: () => void;
}

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-6[1m]", label: "Sonnet 4.6 (1M)" },
  { value: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)" },
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

function getModelValue(model: string | null): string {
  if (!model) return "claude-sonnet-4-6";
  const found = MODELS.find((m) => model.includes(m.value) || m.value.includes(model));
  return found?.value ?? model;
}

const OPENABLE_TOOLS = [
  "Edit", "Bash", "Agent", "Skill", "Mcp", "NotebookEdit", "LSP", "AskUserQuestion",
];

function getModeLabel(mode: PermissionMode): string {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

export function ClaudeSettingsBar({
  conversation,
  sessions,
  onModelChange,
  onModeChange,
  onResumeSession,
  onRefreshSessions,
}: ClaudeSettingsBarProps) {
  const { settings, updateSettings } = useTheme();
  const autoExpandSet = new Set(settings.claude.autoExpandTools);

  const toggleTool = (tool: string) => {
    const next = new Set(autoExpandSet);
    if (next.has(tool)) next.delete(tool);
    else next.add(tool);
    updateSettings({ claude: { ...settings.claude, autoExpandTools: [...next] } });
  };

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      {/* Model selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
            <IconCpu size={12} />
            {getModelLabel(conversation.model)}
            <IconChevronDown size={10} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={getModelValue(conversation.model)}
            onValueChange={onModelChange}
          >
            {MODELS.map((m) => (
              <DropdownMenuRadioItem key={m.value} value={m.value}>
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Permission mode selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
            <IconShield size={12} />
            {getModeLabel(conversation.permissionMode)}
            <IconChevronDown size={10} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuLabel>Permission Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={conversation.permissionMode}
            onValueChange={(v) => onModeChange(v as PermissionMode)}
          >
            {MODES.map((m) => (
              <DropdownMenuRadioItem key={m.value} value={m.value}>
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Auto-expand tools */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
            <IconEye size={12} />
            Expand
            <IconChevronDown size={10} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuLabel>Auto-expand Tools</DropdownMenuLabel>
          {OPENABLE_TOOLS.map((tool) => (
            <DropdownMenuCheckboxItem
              key={tool}
              checked={autoExpandSet.has(tool)}
              onCheckedChange={() => toggleTool(tool)}
            >
              {tool}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Session history */}
      {sessions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
              <IconHistory size={12} />
              Sessions
              <IconChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[360px]">
            <DropdownMenuLabel>Session History</DropdownMenuLabel>
            {sessions.slice(0, 15).map((s) => (
              <DropdownMenuItem
                key={s.sessionId}
                onClick={() => onResumeSession(s.sessionId)}
                className={conversation.sessionId === s.sessionId ? "font-medium text-foreground" : ""}
              >
                <span className="truncate">{s.summary.slice(0, 100)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRefreshSessions}>
              <IconRefresh size={12} />
              Refresh
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
