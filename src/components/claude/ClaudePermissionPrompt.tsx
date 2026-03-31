import type { ClaudePermissionRequest } from "@/types/claude";
import { getToolSummary } from "./claude-utils";
import { Button } from "@/components/ui/button";
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
    request.description || request.title || `${request.toolName} wants to execute`;

  const inputSummary = getInputSummary(request);

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
          </div>
        </div>

        {inputSummary && (
          <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
            {inputSummary}
          </pre>
        )}

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

function getInputSummary(request: ClaudePermissionRequest): string | null {
  const summary = getToolSummary(request.toolName, request.input);
  if (summary) {
    return request.toolName === "Bash" ? `$ ${summary}` : summary;
  }
  if (Object.keys(request.input).length > 0) {
    return JSON.stringify(request.input, null, 2);
  }
  return null;
}
