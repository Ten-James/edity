import {
  IconPlus,
  IconMinus,
  IconArrowBackUp,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GitFileStatus } from "@/types/git";

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

function FileRow({
  file,
  statusCode,
  isSelected,
  onClick,
  actions,
}: {
  file: GitFileStatus;
  statusCode: string;
  isSelected: boolean;
  onClick: () => void;
  actions: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer hover:bg-accent rounded-sm",
        isSelected && "bg-accent",
      )}
    >
      <span className={cn("font-mono w-3 shrink-0", statusColor(statusCode))}>
        {statusCode}
      </span>
      <span className="truncate flex-1">{file.path}</span>
      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 gap-0.5">
        {actions}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}{" "}
        <span className="text-[10px] font-normal">({count})</span>
      </span>
      {action}
    </div>
  );
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
  const iconSize = 13;

  return (
    <ScrollArea className="flex-1">
      <div className="py-1">
        {staged.length > 0 && (
          <div>
            <SectionHeader
              title="Staged"
              count={staged.length}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => onUnstage(staged.map((f) => f.path))}
                  title="Unstage all"
                >
                  <IconMinus size={iconSize} />
                </Button>
              }
            />
            {staged.map((file) => (
              <FileRow
                key={`s-${file.path}`}
                file={file}
                statusCode={file.indexStatus}
                isSelected={
                  selectedFile?.path === file.path && selectedFile.staged
                }
                onClick={() => onSelectFile(file.path, true)}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnstage([file.path]);
                    }}
                    title="Unstage"
                  >
                    <IconMinus size={iconSize} />
                  </Button>
                }
              />
            ))}
          </div>
        )}

        {unstaged.length > 0 && (
          <div>
            <SectionHeader
              title="Changes"
              count={unstaged.length}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => onStage(unstaged.map((f) => f.path))}
                  title="Stage all"
                >
                  <IconPlus size={iconSize} />
                </Button>
              }
            />
            {unstaged.map((file) => (
              <FileRow
                key={`u-${file.path}`}
                file={file}
                statusCode={file.workTreeStatus}
                isSelected={
                  selectedFile?.path === file.path && !selectedFile.staged
                }
                onClick={() => onSelectFile(file.path, false)}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDiscard([file.path]);
                      }}
                      title="Discard"
                    >
                      <IconArrowBackUp size={iconSize} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStage([file.path]);
                      }}
                      title="Stage"
                    >
                      <IconPlus size={iconSize} />
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}

        {untracked.length > 0 && (
          <div>
            <SectionHeader
              title="Untracked"
              count={untracked.length}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => onStage(untracked.map((f) => f.path))}
                  title="Stage all"
                >
                  <IconPlus size={iconSize} />
                </Button>
              }
            />
            {untracked.map((file) => (
              <FileRow
                key={`t-${file.path}`}
                file={file}
                statusCode="?"
                isSelected={
                  selectedFile?.path === file.path && !selectedFile.staged
                }
                onClick={() => onSelectFile(file.path, false)}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStage([file.path]);
                    }}
                    title="Stage"
                  >
                    <IconPlus size={iconSize} />
                  </Button>
                }
              />
            ))}
          </div>
        )}

        {staged.length === 0 &&
          unstaged.length === 0 &&
          untracked.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No changes
            </div>
          )}
      </div>
    </ScrollArea>
  );
}
