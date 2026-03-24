import { IconArrowBackUp } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GitFileStatus } from "@/types/git";

interface ChangeFile {
  file: GitFileStatus;
  isStaged: boolean;
  statusCode: string;
}

interface GitChangesPanelProps {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  selectedFile: { path: string; staged: boolean } | null;
  onSelectFile: (path: string, staged: boolean) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
}

function statusColor(code: string) {
  switch (code) {
    case "M":
      return "text-orange-400";
    case "A":
      return "text-green-400";
    case "D":
      return "text-red-400";
    case "R":
      return "text-blue-400";
    case "?":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function GitChangesPanel({
  staged,
  unstaged,
  untracked,
  selectedFile,
  onSelectFile,
  onStage,
  onUnstage,
  onDiscard,
}: GitChangesPanelProps) {
  // Build unified file list
  const files: ChangeFile[] = [];

  for (const file of staged) {
    files.push({ file, isStaged: true, statusCode: file.indexStatus });
  }
  for (const file of unstaged) {
    // Skip if already in staged (file can be both partially staged and modified)
    if (!staged.some((s) => s.path === file.path)) {
      files.push({ file, isStaged: false, statusCode: file.workTreeStatus });
    }
  }
  for (const file of untracked) {
    files.push({ file, isStaged: false, statusCode: "?" });
  }

  const allStaged = files.length > 0 && files.every((f) => f.isStaged);
  const someStaged = files.some((f) => f.isStaged);

  const handleToggleAll = () => {
    if (allStaged) {
      onUnstage(files.map((f) => f.file.path));
    } else {
      const toStage = files.filter((f) => !f.isStaged).map((f) => f.file.path);
      if (toStage.length > 0) onStage(toStage);
    }
  };

  const handleToggle = (f: ChangeFile) => {
    if (f.isStaged) {
      onUnstage([f.file.path]);
    } else {
      onStage([f.file.path]);
    }
  };

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="px-3 py-8 text-center text-xs text-muted-foreground">
          No changes
        </span>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="py-1">
        {/* Header with select-all checkbox */}
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border mb-1">
          <input
            type="checkbox"
            checked={allStaged}
            ref={(el) => {
              if (el) el.indeterminate = someStaged && !allStaged;
            }}
            onChange={handleToggleAll}
            className="accent-primary h-3.5 w-3.5 cursor-pointer"
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Files{" "}
            <span className="text-[10px] font-normal">({files.length})</span>
          </span>
        </div>

        {files.map((f) => {
          const isSelected =
            selectedFile?.path === f.file.path &&
            selectedFile.staged === f.isStaged;
          const canDiscard =
            !f.isStaged && f.statusCode !== "?" && f.statusCode !== "A";

          return (
            <div
              key={`${f.isStaged ? "s" : "u"}-${f.file.path}`}
              onClick={() => onSelectFile(f.file.path, f.isStaged)}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer hover:bg-accent rounded-sm",
                isSelected && "bg-accent",
              )}
            >
              <input
                type="checkbox"
                checked={f.isStaged}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggle(f);
                }}
                onClick={(e) => e.stopPropagation()}
                className="accent-primary h-3.5 w-3.5 cursor-pointer shrink-0"
              />
              <span
                className={cn(
                  "font-mono w-3 shrink-0",
                  statusColor(f.statusCode),
                )}
              >
                {f.statusCode}
              </span>
              <span className="truncate flex-1">{f.file.path}</span>
              {canDiscard && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard([f.file.path]);
                  }}
                  title="Discard"
                >
                  <IconArrowBackUp size={13} />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
