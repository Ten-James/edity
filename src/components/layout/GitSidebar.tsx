import { useState, useCallback, useEffect } from "react";
import {
  IconGitBranch,
  IconCloudDownload,
  IconCloudUpload,
  IconRefresh,
  IconExternalLink,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/contexts/AppContext";
import { useGitState } from "@/hooks/useGitState";
import type { GitFileStatus } from "@/types/git";
import { cn } from "@/lib/utils";
import { statusColor, timeAgo, relPath } from "@/lib/git-utils";

function fileStatus(f: GitFileStatus): { label: string; staged: boolean } {
  if (f.indexStatus && f.indexStatus !== "?" && f.indexStatus !== " ") {
    return { label: f.indexStatus, staged: true };
  }
  return { label: f.workTreeStatus || "?", staged: false };
}

export function GitSidebar() {
  const {
    activeProject,
    gitBranchInfo,
    createGitTab,
    toggleSidebarPanel,
    openFileTab,
  } = useAppContext();

  const projectPath = activeProject?.path ?? "";
  const git = useGitState(projectPath);
  const [commitMsg, setCommitMsg] = useState("");

  useEffect(() => {
    git.loadLog(15);
  }, [git.loadLog]);

  const allChanges: (GitFileStatus & { _staged: boolean })[] = [
    ...git.staged.map((f) => ({ ...f, _staged: true })),
    ...git.unstaged.map((f) => ({ ...f, _staged: false })),
    ...git.untracked.map((f) => ({ ...f, _staged: false })),
  ];

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    await git.commit(commitMsg.trim());
    setCommitMsg("");
  }, [commitMsg, git]);

  const handleOpenFullView = useCallback(() => {
    createGitTab();
    toggleSidebarPanel("git");
  }, [createGitTab, toggleSidebarPanel]);

  if (!activeProject) return null;

  return (
    <div className="flex h-full w-[260px] flex-col bg-background shrink-0">
      {/* Branch header */}
      <div className="flex items-center gap-1.5 h-8 px-2 border-b border-border shrink-0">
        <IconGitBranch size={12} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate">
          {gitBranchInfo?.current ?? "unknown"}
        </span>
        {gitBranchInfo && gitBranchInfo.ahead > 0 && (
          <span className="text-[10px] text-green-500">{gitBranchInfo.ahead}↑</span>
        )}
        {gitBranchInfo && gitBranchInfo.behind > 0 && (
          <span className="text-[10px] text-orange-500">{gitBranchInfo.behind}↓</span>
        )}
      </div>

      {/* Remote actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 shrink-0">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => git.fetch()}
          disabled={git.isPulling || git.isPushing}
        >
          <IconRefresh size={12} />
          Fetch
        </Button>
        {gitBranchInfo && gitBranchInfo.behind > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => git.pull()}
            disabled={git.isPulling}
          >
            {git.isPulling ? <IconLoader2 size={12} className="animate-spin" /> : <IconCloudDownload size={12} />}
            Pull
          </Button>
        )}
        {gitBranchInfo && gitBranchInfo.ahead > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => git.push()}
            disabled={git.isPushing}
          >
            {git.isPushing ? <IconLoader2 size={12} className="animate-spin" /> : <IconCloudUpload size={12} />}
            Push
          </Button>
        )}
      </div>

      <Separator />

      {/* Changes list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-1 py-1">
          {allChanges.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground text-center">No changes</p>
          )}
          {allChanges.map((f) => {
            const st = fileStatus(f);
            return (
              <Button
                key={f.path + (f._staged ? "-s" : "-u")}
                variant="ghost"
                size="xs"
                className="w-full justify-start gap-1.5 font-normal h-6"
                onClick={() => openFileTab(f.path)}
              >
                <span
                  className={cn("shrink-0 w-3 text-center text-[10px] font-bold", statusColor(st.label))}
                >
                  {st.label}
                </span>
                <span className="truncate text-xs">
                  {relPath(f.path, projectPath)}
                </span>
                {f._staged && (
                  <IconCheck size={10} className="ml-auto shrink-0 text-green-500" />
                )}
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      <Separator />

      {/* Commit area */}
      <div className="px-2 py-1.5 shrink-0">
        <Textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          rows={2}
          className="resize-none text-xs mb-1.5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCommit();
            }
          }}
        />
        <Button
          size="xs"
          className="w-full"
          disabled={!commitMsg.trim() || git.isCommitting || git.staged.length === 0}
          onClick={handleCommit}
        >
          {git.isCommitting ? <IconLoader2 size={12} className="animate-spin" /> : <IconCheck size={12} />}
          Commit{git.staged.length > 0 ? ` (${git.staged.length})` : ""}
        </Button>
      </div>

      <Separator />

      {/* Git log */}
      <ScrollArea className="h-[140px] shrink-0">
        <div className="px-1 py-1">
          {git.log.map((entry) => (
            <div key={entry.hash} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px]">
              <span className="text-muted-foreground font-mono shrink-0">{entry.shortHash}</span>
              <span className="truncate">{entry.subject}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{timeAgo(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="px-2 py-1.5 shrink-0">
        <Button
          variant="ghost"
          size="xs"
          className="w-full justify-center gap-1 text-muted-foreground"
          onClick={handleOpenFullView}
        >
          <IconExternalLink size={12} />
          Open full view
        </Button>
      </div>
    </div>
  );
}
