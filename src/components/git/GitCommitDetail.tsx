import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitDiffViewer } from "./GitDiffViewer";
import { cn } from "@/lib/utils";
import type { GitCommitDetail as GitCommitDetailType } from "@/types/git";

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
    default:
      return "text-muted-foreground";
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

interface GitCommitDetailProps {
  commit: GitCommitDetailType;
  onClose: () => void;
}

export function GitCommitDetail({ commit, onClose }: GitCommitDetailProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Extract diff for selected file from the full commit diff
  const fileDiff = selectedFile
    ? extractFileDiff(commit.diff, selectedFile)
    : commit.diff;

  const diffPath = selectedFile ?? commit.files[0]?.path ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {commit.shortHash}
            </span>
            <span className="text-xs font-medium truncate">
              {commit.subject}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {commit.author} · {formatDate(commit.timestamp)}
          </div>
          {commit.body && (
            <div className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap">
              {commit.body}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
        >
          <IconX size={14} />
        </Button>
      </div>

      {/* File list + diff */}
      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <ScrollArea className="w-[240px] border-r border-border shrink-0">
          <div className="py-1">
            {commit.files.map((file) => (
              <div
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer hover:bg-accent rounded-sm",
                  selectedFile === file.path && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "font-mono w-3 shrink-0",
                    statusColor(file.status),
                  )}
                >
                  {file.status}
                </span>
                <span className="truncate">{file.path}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Diff */}
        <div className="flex-1">
          <GitDiffViewer diff={fileDiff} filePath={diffPath} />
        </div>
      </div>
    </div>
  );
}

/**
 * Extract a single file's diff from a full commit diff.
 * Finds the section starting with "diff --git a/... b/{filePath}" and
 * returns everything until the next "diff --git" or end of string.
 */
function extractFileDiff(fullDiff: string, filePath: string): string {
  const lines = fullDiff.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (capturing) break;
      if (line.includes(`b/${filePath}`)) {
        capturing = true;
      }
    }
    if (capturing) {
      result.push(line);
    }
  }

  return result.join("\n");
}
