import { useState } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { getToolSummary } from "./claude-utils";
import { getToolIcon, getStatusIcon, INLINE_TOOLS } from "./claude-tool-config";
import { EditDiff, BashCommand, AgentBody, SkillBody, McpBody, FormattedJson } from "./ClaudeToolBodies";

// Re-export for consumers
export { TASK_TOOL_NAMES, INLINE_TOOLS } from "./claude-tool-config";

interface ClaudeToolCallProps {
  toolUse: ClaudeToolUse;
  autoExpand?: boolean;
}

function getToolBody(toolUse: ClaudeToolUse) {
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
    default: {
      const hasInput = Object.keys(input).length > 0 || inputJson;
      return hasInput ? <FormattedJson input={input} inputJson={inputJson} /> : null;
    }
  }
}

export function ClaudeToolCall({ toolUse, autoExpand = false }: ClaudeToolCallProps) {
  const [open, setOpen] = useState(autoExpand);
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

  const body = open ? getToolBody(toolUse) : null;

  return (
    <div className="rounded-md border border-border bg-muted/20 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="shrink-0 text-muted-foreground">{getToolIcon(toolUse.name)}</span>
        <span className="font-medium">{toolUse.name}</span>
        {summary && <span className="truncate text-muted-foreground">{summary}</span>}
        <span className="ml-auto shrink-0">{getStatusIcon(toolUse.status)}</span>
      </button>

      {body && (
        <div className="border-t border-border px-3 py-2">
          {body}
        </div>
      )}
    </div>
  );
}
