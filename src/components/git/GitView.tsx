import { useState } from "react";
import {
  IconGitBranch,
  IconHistory,
  IconFileDiff,
  IconArrowUp,
  IconArrowDown,
  IconRefresh,
  IconLoader2,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useGitState } from "@/hooks/useGitState";
import { useGitStore } from "@/stores/gitStore";
import { dispatch } from "@/stores/eventBus";
import { GitChangesPanel } from "./GitChangesPanel";
import { GitDiffViewer } from "./GitDiffViewer";
import { GitCommitPanel } from "./GitCommitPanel";
import { GitLogPanel } from "./GitLogPanel";
import { GitCommitDetail } from "./GitCommitDetail";
import { GitBranchPanel } from "./GitBranchPanel";
import { cn } from "@/lib/utils";

type Mode = "changes" | "history" | "branches";

interface GitViewProps {
  tabId: string;
  isActive: boolean;
  projectPath: string;
}

export function GitView({ isActive, projectPath }: GitViewProps) {
  const [mode, setMode] = useState<Mode>("changes");
  const gitBranchInfo = useGitStore((s) => s.branchInfo);

  const git = useGitState(projectPath);

  const handlePush = async () => {
    const result = await git.push(!gitBranchInfo?.upstream);
    if (result.ok) {
      toast.success("Pushed to remote");
    } else {
      toast.error(result.error ?? "Push failed");
    }
    dispatch({ type: "git-refresh" });
  };

  const handlePull = async () => {
    const result = await git.pull();
    if (result.ok) {
      toast.success("Pulled from remote");
    } else {
      toast.error(result.error ?? "Pull failed");
    }
    dispatch({ type: "git-refresh" });
  };

  const handleFetch = async () => {
    await git.fetch();
    toast.success("Fetched latest");
    dispatch({ type: "git-refresh" });
  };

  const handleSwitchBranch = async (branch: string) => {
    const result = await git.switchBranch(branch);
    dispatch({ type: "git-refresh" });
    return result;
  };

  if (!isActive) return null;

  if (git.isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!git.isRepo) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <IconAlertTriangle size={24} />
        <span className="text-sm">Not a git repository</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header: mode tabs + remote actions */}
      <div className="flex items-center px-2 h-9 shrink-0">
        <div className="flex gap-0.5">
          <Button
            variant={mode === "changes" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMode("changes")}
          >
            <IconFileDiff size={14} />
            Changes
          </Button>
          <Button
            variant={mode === "history" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMode("history")}
          >
            <IconHistory size={14} />
            History
          </Button>
          <Button
            variant={mode === "branches" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMode("branches")}
          >
            <IconGitBranch size={14} />
            Branches
          </Button>
        </div>

        <div className="flex-1" />

        {gitBranchInfo && (
          <span className="text-[11px] text-muted-foreground mr-2 flex items-center gap-1">
            <IconGitBranch size={12} />
            {gitBranchInfo.current}
          </span>
        )}

        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleFetch}
          >
            <IconRefresh size={14} />
            Fetch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 gap-1 text-xs", git.isPulling && "opacity-50")}
            onClick={handlePull}
            disabled={git.isPulling}
          >
            <IconArrowDown size={14} />
            Pull
            {(gitBranchInfo?.behind ?? 0) > 0 && (
              <span className="text-orange-400 text-[10px]">
                {gitBranchInfo!.behind}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 gap-1 text-xs", git.isPushing && "opacity-50")}
            onClick={handlePush}
            disabled={git.isPushing}
          >
            <IconArrowUp size={14} />
            Push
            {(gitBranchInfo?.ahead ?? 0) > 0 && (
              <span className="text-green-400 text-[10px]">
                {gitBranchInfo!.ahead}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "changes" && (
          <ResizablePanelGroup
            orientation="horizontal"
            id="git-changes-layout"
            className="h-full"
          >
            <ResizablePanel
              defaultSize="28%"
              minSize="15%"
              maxSize="60%"
            >
              <div className="flex h-full flex-col overflow-hidden">
                <GitChangesPanel
                  staged={git.staged}
                  unstaged={git.unstaged}
                  untracked={git.untracked}
                  selectedFile={git.selectedFile}
                  onSelectFile={git.selectFile}
                  onStage={git.stage}
                  onUnstage={git.unstage}
                  onDiscard={git.discard}
                />
                <GitCommitPanel
                  stagedCount={git.staged.length}
                  isCommitting={git.isCommitting}
                  onCommit={git.commit}
                  ahead={gitBranchInfo?.ahead ?? 0}
                  isPushing={git.isPushing}
                  onPush={handlePush}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="72%" minSize="30%">
              <div className="h-full">
                <GitDiffViewer
                  diff={git.selectedDiff}
                  filePath={git.selectedFile?.path ?? null}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {mode === "history" &&
          // Keyed remount on selection toggle — react-resizable-panels needs
          // a stable set of panels, and conditionally rendering the detail
          // panel would otherwise confuse its size tracking.
          (git.selectedCommit ? (
            <ResizablePanelGroup
              key="history-with-commit"
              orientation="horizontal"
              id="git-history-layout"
              className="h-full"
            >
              <ResizablePanel
                defaultSize="40%"
                minSize="20%"
                maxSize="70%"
              >
                <div className="flex h-full flex-col overflow-hidden">
                  <GitLogPanel
                    log={git.log}
                    selectedHash={git.selectedCommit.hash}
                    onLoadLog={git.loadLog}
                    onSelectCommit={git.selectCommit}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="60%" minSize="30%">
                <div className="h-full">
                  <GitCommitDetail
                    commit={git.selectedCommit}
                    onClose={git.clearSelectedCommit}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <GitLogPanel
                log={git.log}
                selectedHash={null}
                onLoadLog={git.loadLog}
                onSelectCommit={git.selectCommit}
              />
            </div>
          ))}

        {mode === "branches" && (
          <GitBranchPanel
            branches={git.branches}
            onLoadBranches={git.loadBranches}
            onSwitch={handleSwitchBranch}
            onCreate={git.createBranch}
            onDelete={git.deleteBranch}
          />
        )}
      </div>
    </div>
  );
}
