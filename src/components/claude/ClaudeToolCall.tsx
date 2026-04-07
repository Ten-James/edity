import { useState } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { dispatch } from "@/stores/eventBus";
import { getToolSummary, getFilePath } from "@/lib/claude-utils";
import { getToolIcon, getStatusIcon, INLINE_TOOLS } from "./claude-tool-config";
import {
  EditDiff,
  BashCommand,
  AgentBody,
  SkillBody,
  McpBody,
  FormattedJson,
} from "./ClaudeToolBodies";

const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}

function getEffectiveStatus(toolUse: ClaudeToolUse): ClaudeToolUse["status"] {
  if (toolUse.name === "Agent" && toolUse.status === "complete") {
    const hasRunning = toolUse.subToolUses?.some(
      (t) => t.status === "running" || t.status === "pending",
    );
    if (hasRunning) return "running";
  }
  return toolUse.status;
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

interface ClaudeToolCallProps {
  toolUse: ClaudeToolUse;
  autoExpand?: boolean;
}

export function ClaudeToolCall({
  toolUse,
  autoExpand = false,
}: ClaudeToolCallProps) {
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPath = activeProject?.path ?? "";
  const isQuestion = toolUse.name === "AskUserQuestion";
  const isActiveAgent = toolUse.name === "Agent" && getEffectiveStatus(toolUse) === "running";
  const [open, setOpen] = useState(autoExpand || isQuestion || isActiveAgent);
  const [prevIsActiveAgent, setPrevIsActiveAgent] = useState(isActiveAgent);

  if (isActiveAgent !== prevIsActiveAgent) {
    setPrevIsActiveAgent(isActiveAgent);
    if (isActiveAgent) setOpen(true);
  }

  const rawSummary =
    getToolSummary(toolUse.name, toolUse.input, toolUse.inputJson) ??
    toolUse.name;
  const summary = projectPath && rawSummary.startsWith(projectPath + "/")
    ? rawSummary.slice(projectPath.length + 1)
    : rawSummary;
  const isInline = INLINE_TOOLS.has(toolUse.name);

  if (toolUse.name === "AskUserQuestion") {
    const rawQuestions = Array.isArray(toolUse.input.questions)
      ? toolUse.input.questions
      : [];
    const questionText = getStringField(rawQuestions[0], "question") ?? summary;
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
        onClick={clickable ? () => dispatch({ type: "tab-open-file", filePath }) : undefined}
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
