import type { ClaudeToolUse } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClaudeToolCall } from "./ClaudeToolCall";

interface ToolInputProps {
  input: Record<string, unknown>;
  inputJson: string;
}

// --- Edit: inline diff ---

export function EditDiff({ input, inputJson }: ToolInputProps) {
  const oldStr =
    input.old_string != null
      ? String(input.old_string)
      : extractJsonField(inputJson, "old_string");
  const newStr =
    input.new_string != null
      ? String(input.new_string)
      : extractJsonField(inputJson, "new_string");

  if (!oldStr && !newStr) return null;

  const oldLines = (oldStr ?? "").split("\n");
  const newLines = (newStr ?? "").split("\n");
  const diffLines = computeInlineDiff(oldLines, newLines);

  return (
    <div className="max-h-60 overflow-auto bg-muted font-mono text-xs">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={
            line.type === "removed"
              ? "bg-red-500/15 text-red-400"
              : line.type === "added"
                ? "bg-green-500/15 text-green-400"
                : "text-muted-foreground"
          }
        >
          <span className="inline-block w-4 select-none text-center opacity-50">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          <span className="whitespace-pre-wrap break-all">{line.content}</span>
        </div>
      ))}
    </div>
  );
}

// --- Bash: show command ---

export function BashCommand({ input, inputJson }: ToolInputProps) {
  const command = input.command ? String(input.command) : null;
  const partialCommand =
    !command && inputJson
      ? inputJson.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]
      : null;
  const display = command ?? partialCommand;
  if (!display) return null;

  return <CodeBlock>{display}</CodeBlock>;
}

// --- Agent: sub-content + sub-tool calls ---

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLLAPSED_COUNT = 5;

export function AgentBody({ toolUse }: { toolUse: ClaudeToolUse }) {
  const [showAll, setShowAll] = useState(false);
  const subTools = toolUse.subToolUses ?? [];
  const hasMore = subTools.length > COLLAPSED_COUNT;
  const visibleTools = showAll ? subTools : subTools.slice(-COLLAPSED_COUNT);
  const hiddenCount = subTools.length - COLLAPSED_COUNT;

  return (
    <ScrollArea className="max-h-64">
      <div className="px-3 py-2 flex flex-col gap-1">
        {subTools.length > 0 && (
          <>
            {hasMore && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
              >
                Show {hiddenCount} more...
              </button>
            )}
            {hasMore && showAll && (
              <button
                onClick={() => setShowAll(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
              >
                Show less
              </button>
            )}
            {visibleTools.map((sub) => (
              <ClaudeToolCall key={sub.id} toolUse={sub} />
            ))}
          </>
        )}
        {toolUse.subContent && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:text-xs [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
            <Markdown remarkPlugins={[remarkGfm]}>{toolUse.subContent}</Markdown>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// --- Skill: show args ---

export function SkillBody({ input }: { input: Record<string, unknown> }) {
  if (!input.args) return null;
  return <CodeBlock className="max-h-40">{String(input.args)}</CodeBlock>;
}

// --- Mcp: show tool input ---

export function McpBody({ input }: { input: Record<string, unknown> }) {
  if (!input.input) return null;
  return (
    <CodeBlock className="max-h-40">
      {typeof input.input === "string"
        ? input.input
        : JSON.stringify(input.input, null, 2)}
    </CodeBlock>
  );
}

// --- AskUserQuestion: interactive question UI ---

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

export function AskUserQuestionBody({
  input,
  isRunning,
  onAnswer,
}: {
  input: Record<string, unknown>;
  isRunning: boolean;
  onAnswer?: (answer: string) => void;
}) {
  const questions = (input.questions ?? []) as Question[];
  if (questions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {q.header && (
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {q.header}
            </span>
          )}
          <p className="text-xs">{q.question}</p>
          {q.options && isRunning && onAnswer && (
            <div className="flex flex-wrap gap-1">
              {q.options.map((opt) => (
                <Button
                  key={opt.label}
                  variant="outline"
                  size="xs"
                  onClick={() => onAnswer(opt.label)}
                  title={opt.description}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Fallback: formatted JSON ---

export function FormattedJson({ input, inputJson }: ToolInputProps) {
  const json =
    Object.keys(input).length > 0
      ? JSON.stringify(input, null, 2)
      : inputJson || "{}";

  return <CodeBlock>{json}</CodeBlock>;
}

// --- Diff helpers ---

interface DiffLine {
  type: "context" | "removed" | "added";
  content: string;
}

function computeInlineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "context", content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", content: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", content: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

function extractJsonField(json: string, field: string): string | null {
  if (!json) return null;
  const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = json.match(regex);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}
