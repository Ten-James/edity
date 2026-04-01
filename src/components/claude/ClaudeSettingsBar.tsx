import type {
  ClaudeConversation,
  ClaudeSessionInfo,
  PermissionMode,
} from "@/types/claude";
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
  IconShieldCheck,
  IconShieldOff,
  IconEye,
  IconMap,
  IconHammer,
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

function getModelLabel(model: string | null): string {
  if (!model) return "Sonnet 4.6";
  const found = MODELS.find(
    (m) => model.includes(m.value) || m.value.includes(model),
  );
  return found?.label ?? model;
}

function getModelValue(model: string | null): string {
  if (!model) return "claude-sonnet-4-6";
  const found = MODELS.find(
    (m) => model.includes(m.value) || m.value.includes(model),
  );
  return found?.value ?? model;
}

const OPENABLE_TOOLS = [
  "Edit",
  "Bash",
  "Agent",
  "Skill",
  "Mcp",
  "NotebookEdit",
  "LSP",
  "AskUserQuestion",
];

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
  const hasSession = conversation.sessionId !== null;
  const isFullAuto = conversation.permissionMode === "bypassPermissions";

  const toggleTool = (tool: string) => {
    const next = new Set(autoExpandSet);
    if (next.has(tool)) next.delete(tool);
    else next.add(tool);
    updateSettings({
      claude: { ...settings.claude, autoExpandTools: [...next] },
    });
  };

  const toggleAutoMode = () => {
    onModeChange(isFullAuto ? "default" : "bypassPermissions");
  };

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      {/* Mode: Plan / Build / Agents */}
      <div className="flex items-center border border-border overflow-hidden">
        <Button
          variant={conversation.permissionMode === "plan" ? "secondary" : "ghost"}
          size="xs"
          className="rounded-none gap-1 text-muted-foreground h-6 px-2"
          disabled={hasSession}
          onClick={() => onModeChange("plan")}
        >
          <IconMap size={11} />
          Plan
        </Button>
        <Button
          variant={conversation.permissionMode !== "plan" ? "secondary" : "ghost"}
          size="xs"
          className="rounded-none gap-1 text-muted-foreground h-6 px-2"
          disabled={hasSession}
          onClick={() => onModeChange(isFullAuto ? "bypassPermissions" : "default")}
        >
          <IconHammer size={11} />
          Build
        </Button>
      </div>

      {/* Permission toggle: Default / Full Auto */}
      <Button
        variant="ghost"
        size="xs"
        className="gap-1 text-muted-foreground"
        disabled={hasSession || conversation.permissionMode === "plan"}
        onClick={toggleAutoMode}
        title={isFullAuto ? "Full Auto — no permission prompts" : "Default — asks for permission"}
      >
        {isFullAuto ? <IconShieldOff size={12} /> : <IconShieldCheck size={12} />}
        {isFullAuto ? "Auto" : "Safe"}
      </Button>

      {/* Model selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-muted-foreground"
          >
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

      {/* Auto-expand tools */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-muted-foreground"
          >
            <IconEye size={12} />
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

      <div className="flex-1" />

      {/* Session history */}
      {sessions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="gap-1 text-muted-foreground"
            >
              <IconHistory size={12} />
              <IconChevronDown size={10} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-[360px]">
            <DropdownMenuLabel>Session History</DropdownMenuLabel>
            {sessions.slice(0, 15).map((s) => (
              <DropdownMenuItem
                key={s.sessionId}
                onClick={() => onResumeSession(s.sessionId)}
                className={
                  conversation.sessionId === s.sessionId
                    ? "font-medium text-foreground"
                    : ""
                }
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
