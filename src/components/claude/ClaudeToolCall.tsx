import { useState } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { getToolSummary } from "./claude-utils";
import {
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconPencil,
  IconTerminal2,
  IconSearch,
  IconWorld,
  IconTool,
  IconLoader2,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

interface ClaudeToolCallProps {
  toolUse: ClaudeToolUse;
}

function getToolIcon(name: string) {
  switch (name) {
    case "Read":
      return <IconFile size={12} />;
    case "Edit":
    case "Write":
      return <IconPencil size={12} />;
    case "Bash":
      return <IconTerminal2 size={12} />;
    case "Glob":
    case "Grep":
      return <IconSearch size={12} />;
    case "WebSearch":
    case "WebFetch":
      return <IconWorld size={12} />;
    default:
      return <IconTool size={12} />;
  }
}

function getStatusIcon(status: ClaudeToolUse["status"]) {
  switch (status) {
    case "running":
    case "pending":
      return <IconLoader2 size={12} className="animate-spin text-blue-500" />;
    case "complete":
      return <IconCheck size={12} className="text-green-500" />;
    case "error":
      return <IconX size={12} className="text-destructive" />;
  }
}

export function ClaudeToolCall({ toolUse }: ClaudeToolCallProps) {
  const [open, setOpen] = useState(false);
  const summary = getToolSummary(toolUse.name, toolUse.input) ?? toolUse.name;
  const hasInput = Object.keys(toolUse.input).length > 0 || toolUse.inputJson;

  return (
    <div className="rounded-md border border-border bg-muted/20 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <IconChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <IconChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 text-muted-foreground">
          {getToolIcon(toolUse.name)}
        </span>
        <span className="font-medium">{toolUse.name}</span>
        {summary && (
          <span className="truncate text-muted-foreground">{summary}</span>
        )}
        <span className="ml-auto shrink-0">{getStatusIcon(toolUse.status)}</span>
      </button>

      {open && hasInput && (
        <div className="border-t border-border px-3 py-2">
          <FormattedJson input={toolUse.input} inputJson={toolUse.inputJson} />
        </div>
      )}
    </div>
  );
}

function FormattedJson({ input, inputJson }: { input: Record<string, unknown>; inputJson: string }) {
  const json = Object.keys(input).length > 0
    ? JSON.stringify(input, null, 2)
    : inputJson || "{}";

  return (
    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
      {json}
    </pre>
  );
}
