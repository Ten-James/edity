import { useState } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { getToolSummary } from "./claude-utils";
import { getToolIcon, getStatusIcon, INLINE_TOOLS } from "./claude-tool-config";
import { EditDiff, BashCommand, AgentBody, SkillBody, McpBody, AskUserQuestionBody, FormattedJson } from "./ClaudeToolBodies";

// Re-export for consumers
export { TASK_TOOL_NAMES, INLINE_TOOLS } from "./claude-tool-config";

interface ClaudeToolCallProps {
  toolUse: ClaudeToolUse;
  autoExpand?: boolean;
  onAnswer?: (answer: string) => void;
}

function getToolBody(toolUse: ClaudeToolUse, onAnswer?: (answer: string) => void) {
  const { name, input, inputJson } = toolUse;
  const hasAgent = toolUse.subContent || (toolUse.subToolUses && toolUse.subToolUses.length > 0);

  switch (name) {
    case "Agent":
      return hasAgent ? <AgentBody toolUse={toolUse} /> : null;
    case "Bash":
      return <BashCommand input={input} inputJson={inputJson} />;
    case "Edit":
      return <EditDiff input={input} inputJson={inputJson} />;
    case "Skill":
      return <SkillBody input={input} />;
    case "Mcp":
      return <McpBody input={input} />;
    case "AskUserQuestion":
      return <AskUserQuestionBody input={input} isRunning={toolUse.status === "running"} onAnswer={onAnswer} />;
    default: {
      const hasInput = Object.keys(input).length > 0 || inputJson;
      return hasInput ? <FormattedJson input={input} inputJson={inputJson} /> : null;
    }
  }
}

export function ClaudeToolCall({ toolUse, autoExpand = false, onAnswer }: ClaudeToolCallProps) {
  const isQuestion = toolUse.name === "AskUserQuestion";
  const [open, setOpen] = useState(autoExpand || isQuestion);
  const summary = getToolSummary(toolUse.name, toolUse.input, toolUse.inputJson) ?? toolUse.name;
  const isInline = INLINE_TOOLS.has(toolUse.name);

  if (isInline) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs">
        <span className="shrink-0 text-muted-foreground">{getToolIcon(toolUse.name)}</span>
        <span className="font-medium">{toolUse.name}</span>
        {summary && <span className="truncate text-muted-foreground">{summary}</span>}
        <span className="ml-auto shrink-0">{getStatusIcon(toolUse.status)}</span>
      </div>
    );
  }

  const body = open ? getToolBody(toolUse, onAnswer) : null;

  return (
    <div className="border border-border bg-muted/20 text-xs">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-start gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors h-auto"
      >
        <span className="shrink-0 text-muted-foreground">{getToolIcon(toolUse.name)}</span>
        <span className="font-medium">{toolUse.name}</span>
        {summary && <span className="truncate text-muted-foreground">{summary}</span>}
        <span className="ml-auto shrink-0">{getStatusIcon(toolUse.status)}</span>
      </Button>

      {body && (
        <div className="border-t border-border">
          {body}
        </div>
      )}
    </div>
  );
}
