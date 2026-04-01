import type { ReactNode } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import {
  IconFile,
  IconPencil,
  IconTerminal2,
  IconSearch,
  IconWorld,
  IconTool,
  IconLoader2,
  IconCheck,
  IconX,
  IconRobot,
  IconQuestionMark,
  IconNotebook,
  IconCode,
  IconPlug,
  IconMap,
  IconGitBranch,
  IconWand,
} from "@tabler/icons-react";

export const TASK_TOOL_NAMES = new Set([
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "AskUserQuestion",
]);

export const INLINE_TOOLS = new Set([
  "Read",
  "Write",
  "WebSearch",
  "WebFetch",
  "Glob",
  "Grep",
  "ToolSearch",
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "ListMcpResources",
  "ReadMcpResource",
]);

export function getToolIcon(name: string): ReactNode {
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
    case "ToolSearch":
      return <IconSearch size={12} />;
    case "WebSearch":
    case "WebFetch":
      return <IconWorld size={12} />;
    case "Agent":
      return <IconRobot size={12} />;
    case "AskUserQuestion":
      return <IconQuestionMark size={12} />;
    case "NotebookEdit":
      return <IconNotebook size={12} />;
    case "LSP":
      return <IconCode size={12} />;
    case "Mcp":
    case "ListMcpResources":
    case "ReadMcpResource":
      return <IconPlug size={12} />;
    case "EnterPlanMode":
    case "ExitPlanMode":
      return <IconMap size={12} />;
    case "EnterWorktree":
    case "ExitWorktree":
      return <IconGitBranch size={12} />;
    case "Skill":
      return <IconWand size={12} />;
    default:
      return <IconTool size={12} />;
  }
}

export function getStatusIcon(status: ClaudeToolUse["status"]): ReactNode {
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
