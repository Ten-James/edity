import { IconArrowBackUp, IconCircleFilled, IconCircle } from "@tabler/icons-react";
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
  const files: ChangeFile[] = [];

  for (const file of staged) {
    files.push({ file, isStaged: true, statusCode: file.indexStatus });
  }
  for (const file of unstaged) {
    if (!staged.some((s) => s.path === file.path)) {
      files.push({ file, isStaged: false, statusCode: file.workTreeStatus });
    }
  }
  for (const file of untracked) {
    files.push({ file, isStaged: false, statusCode: "?" });
  }

  const allStaged = files.length > 0 && files.every((f) => f.isStaged);

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
        {/* Header with stage-all toggle */}
        <div className="flex items-center gap-2 px-2 py-1 mb-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleToggleAll}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors h-auto p-0"
            title={allStaged ? "Unstage all" : "Stage all"}
          >
            {allStaged ? (
              <IconCircleFilled size={14} className="text-primary" />
            ) : (
              <IconCircle size={14} />
            )}
          </Button>
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
                "group flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer hover:bg-accent",
                isSelected && "bg-accent",
              )}
            >
              <Button
                variant="ghost"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(f);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors h-auto p-0"
                title={f.isStaged ? "Unstage" : "Stage"}
              >
                {f.isStaged ? (
                  <IconCircleFilled size={12} className="text-primary" />
                ) : (
                  <IconCircle size={12} />
                )}
              </Button>
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
