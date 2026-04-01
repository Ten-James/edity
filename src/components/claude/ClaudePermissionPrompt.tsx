import type { ClaudePermissionRequest } from "@/types/claude";
import { getToolSummary, getFilePath } from "@/lib/claude-utils";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { IconShieldCheck, IconShieldX } from "@tabler/icons-react";

interface ClaudePermissionPromptProps {
  request: ClaudePermissionRequest;
  onRespond: (toolUseID: string, behavior: "allow" | "deny") => void;
}

export function ClaudePermissionPrompt({
  request,
  onRespond,
}: ClaudePermissionPromptProps) {
  const description =
    request.description ||
    request.title ||
    `${request.toolName} wants to execute`;

  const filePath = getFilePath(request.input);
  const detail = getPermissionDetail(request);

  return (
    <div className="border-t border-border bg-amber-500/5 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <IconShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-amber-500"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Permission Required</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
            {filePath && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {filePath}
              </p>
            )}
          </div>
        </div>

        {detail && <CodeBlock className="max-h-64">{detail}</CodeBlock>}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => onRespond(request.toolUseID, "allow")}
          >
            <IconShieldCheck size={14} className="mr-1" />
            Allow
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onRespond(request.toolUseID, "deny")}
          >
            <IconShieldX size={14} className="mr-1" />
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}

function getPermissionDetail(request: ClaudePermissionRequest): string | null {
  const { toolName, input } = request;

  switch (toolName) {
    case "Bash":
      return input.command ? String(input.command) : null;
    case "Write":
      return input.content ? String(input.content) : null;
    case "Edit":
      if (input.old_string != null && input.new_string != null) {
        const lines: string[] = [];
        for (const line of String(input.old_string).split("\n")) {
          lines.push(`- ${line}`);
        }
        for (const line of String(input.new_string).split("\n")) {
          lines.push(`+ ${line}`);
        }
        return lines.join("\n");
      }
      return null;
    default: {
      const summary = getToolSummary(toolName, input);
      if (summary) return summary;
      if (Object.keys(input).length > 0) return JSON.stringify(input, null, 2);
      return null;
    }
  }
}
