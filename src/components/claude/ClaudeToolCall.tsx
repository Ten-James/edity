import { useState, useEffect } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/AppContext";
import { getToolSummary, getFilePath } from "./claude-utils";
import { getToolIcon, getStatusIcon, INLINE_TOOLS } from "./claude-tool-config";
import {
  EditDiff,
  BashCommand,
  AgentBody,
  SkillBody,
  McpBody,
  FormattedJson,
} from "./ClaudeToolBodies";

// Re-export for consumers
export { TASK_TOOL_NAMES, INLINE_TOOLS } from "./claude-tool-config";

const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);

function getEffectiveStatus(toolUse: ClaudeToolUse): ClaudeToolUse["status"] {
  if (toolUse.name === "Agent" && toolUse.status === "complete") {
    const hasRunning = toolUse.subToolUses?.some((t) => t.status === "running" || t.status === "pending");
    if (hasRunning) return "running";
  }
  return toolUse.status;
}

interface ClaudeToolCallProps {
  toolUse: ClaudeToolUse;
  autoExpand?: boolean;
}

function getToolBody(toolUse: ClaudeToolUse) {
  const { name, input, inputJson } = toolUse;

  switch (name) {
    case "Agent":
      return <AgentBody toolUse={toolUse} />;
    case "Bash":
      return <BashCommand input={input} inputJson={inputJson} />;
    case "Edit":
      return <EditDiff input={input} inputJson={inputJson} />;
    case "Skill":
      return <SkillBody input={input} />;
    case "Mcp":
      return <McpBody input={input} />;
    case "AskUserQuestion":
      return null;
    default: {
      const hasInput = Object.keys(input).length > 0 || inputJson;
      return hasInput ? (
        <FormattedJson input={input} inputJson={inputJson} />
      ) : null;
    }
  }
}

export function ClaudeToolCall({
  toolUse,
  autoExpand = false,
}: ClaudeToolCallProps) {
  const { openFileTab, activeProject } = useAppContext();
  const projectPath = activeProject?.path ?? "";
  const isQuestion = toolUse.name === "AskUserQuestion";
  const isActiveAgent = toolUse.name === "Agent" && getEffectiveStatus(toolUse) === "running";
  const [open, setOpen] = useState(autoExpand || isQuestion || isActiveAgent);

  useEffect(() => {
    if (isActiveAgent) setOpen(true);
  }, [isActiveAgent]);
  const rawSummary =
    getToolSummary(toolUse.name, toolUse.input, toolUse.inputJson) ??
    toolUse.name;
  const summary = projectPath && rawSummary.startsWith(projectPath + "/")
    ? rawSummary.slice(projectPath.length + 1)
    : rawSummary;
  const isInline = INLINE_TOOLS.has(toolUse.name);

  // AskUserQuestion renders as inline question text
  if (toolUse.name === "AskUserQuestion") {
    const questions = (toolUse.input.questions ?? []) as Array<{ question: string }>;
    const questionText = questions[0]?.question ?? summary;
    return (
      <div className="flex items-start gap-1.5 py-0.5 text-xs">
        <span className="shrink-0 text-muted-foreground mt-0.5">
          {getToolIcon(toolUse.name)}
        </span>
        <span className="text-foreground">{questionText}</span>
        <span className="ml-auto shrink-0">
          {getStatusIcon(getEffectiveStatus(toolUse))}
        </span>
      </div>
    );
  }

  if (isInline) {
    const filePath = FILE_TOOLS.has(toolUse.name) ? getFilePath(toolUse.input) : null;
    const clickable = filePath !== null;

    return (
      <div
        className={`flex items-center gap-1.5 py-0.5 text-xs ${clickable ? "cursor-pointer hover:bg-accent/50 rounded-sm px-1 -mx-1 transition-colors" : ""}`}
        onClick={clickable ? () => openFileTab(filePath) : undefined}
      >
        <span className="shrink-0 text-muted-foreground">
          {getToolIcon(toolUse.name)}
        </span>
        <span className="font-medium">{toolUse.name}</span>
        {summary && (
          <span className={`truncate ${clickable ? "text-primary underline underline-offset-2" : "text-muted-foreground"}`}>{summary}</span>
        )}
        <span className="ml-auto shrink-0">
          {getStatusIcon(getEffectiveStatus(toolUse))}
        </span>
      </div>
    );
  }

  const body = open ? getToolBody(toolUse) : null;

  return (
    <div className="border border-border bg-muted/20 text-xs">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-start gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors h-auto"
      >
        <span className="shrink-0 text-muted-foreground">
          {getToolIcon(toolUse.name)}
        </span>
        {toolUse.name === "Agent" && summary ? (
          <>
            <span className="truncate font-medium">{summary}</span>
            {toolUse.progressDescription && getEffectiveStatus(toolUse) === "running" && (
              <span className="truncate text-muted-foreground text-[10px]">{toolUse.progressDescription}</span>
            )}
          </>
        ) : (
          <>
            <span className="font-medium">{toolUse.name}</span>
            {summary && (
              <span className="truncate text-muted-foreground">{summary}</span>
            )}
          </>
        )}
        <span className="ml-auto shrink-0">
          {getStatusIcon(getEffectiveStatus(toolUse))}
        </span>
      </Button>

      {body && <div className="border-t border-border">{body}</div>}
    </div>
  );
}
