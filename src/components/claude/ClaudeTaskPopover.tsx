import { useState } from "react";
import type { ClaudeToolUse } from "@/types/claude";
import { extractTasks } from "@/lib/claude-utils";
import { Button } from "@/components/ui/button";
import {
  IconChecklist,
  IconCheck,
  IconLoader2,
  IconX,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";

interface ClaudeTaskPopoverProps {
  taskTools: ClaudeToolUse[];
}

type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "completed":
      return <IconCheck size={12} className="text-green-500" />;
    case "in_progress":
      return <IconLoader2 size={12} className="animate-spin text-blue-500" />;
    case "pending":
      return (
        <div className="h-3 w-3 rounded-full border border-muted-foreground" />
      );
    default:
      return <IconX size={12} className="text-muted-foreground" />;
  }
}

export function ClaudeTaskPopover({ taskTools }: ClaudeTaskPopoverProps) {
  const [open, setOpen] = useState(true);
  const tasks = extractTasks(taskTools);

  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  return (
    <div className="absolute bottom-full right-3 mb-1 z-10">
      <div className="border border-border bg-popover shadow-md text-xs min-w-[220px] max-w-[320px]">
        <Button
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-start gap-2 px-3 py-2 hover:bg-accent/50 transition-colors h-auto"
        >
          <IconChecklist size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium">Tasks</span>
          <span className="text-muted-foreground ml-1">
            {completed}/{total}
          </span>
          <span className="ml-auto">
            {open ? <IconChevronDown size={12} /> : <IconChevronUp size={12} />}
          </span>
        </Button>

        {open && (
          <div className="border-t border-border px-3 py-2 flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5">
                  <TaskStatusIcon status={task.status} />
                </span>
                <span
                  className={
                    task.status === "completed"
                      ? "text-muted-foreground line-through"
                      : ""
                  }
                >
                  {task.subject}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
