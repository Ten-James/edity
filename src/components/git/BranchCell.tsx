import {
  IconGitBranch,
  IconCheck,
  IconArrowUp,
  IconArrowDown,
  IconGitMerge,
  IconPencil,
  IconTrash,
  IconCloud,
} from "@tabler/icons-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";

interface BranchCellProps {
  branch: GitBranch;
  displayName: string;
  onSwitch: (branch: string) => void;
  onRename: (branch: GitBranch) => void;
  onDelete: (branch: string, force?: boolean) => void;
  onDeleteRemote: (remote: string, branch: string) => void;
  onPush: () => void;
  onPull: () => void;
}

export function BranchCell({
  branch,
  displayName,
  onSwitch,
  onRename,
  onDelete,
  onDeleteRemote,
  onPush,
  onPull,
}: BranchCellProps) {
  const isLocal = !branch.isRemote;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex flex-col gap-0.5 px-2 py-1.5 min-w-0 rounded-sm cursor-default",
            branch.isCurrent
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50",
          )}
          onDoubleClick={() => !branch.isCurrent && onSwitch(branch.name)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <IconGitBranch size={13} className="shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium">{displayName}</span>

            {branch.isCurrent && (
              <IconCheck size={12} className="shrink-0 text-green-400" />
            )}

            {isLocal && branch.isMerged && !branch.isCurrent && (
              <IconGitMerge size={12} className="shrink-0 text-purple-400" title="Merged" />
            )}

            <div className="flex items-center gap-1 ml-auto shrink-0">
              {isLocal && branch.ahead > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-green-400" title={`${branch.ahead} ahead`}>
                  <IconArrowUp size={10} />
                  {branch.ahead}
                </span>
              )}
              {isLocal && branch.behind > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-orange-400" title={`${branch.behind} behind`}>
                  <IconArrowDown size={10} />
                  {branch.behind}
                </span>
              )}
              {isLocal && !branch.upstream && (
                <IconCloud size={10} className="text-muted-foreground/50" title="No upstream" />
              )}
            </div>
          </div>

          <span className="text-[10px] text-muted-foreground truncate pl-5">
            {branch.commitSubject}
          </span>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {isLocal ? (
          <LocalBranchMenu
            branch={branch}
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
            onPush={onPush}
            onPull={onPull}
          />
        ) : (
          <RemoteBranchMenu
            branch={branch}
            onSwitch={onSwitch}
            onDeleteRemote={onDeleteRemote}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function LocalBranchMenu({
  branch,
  onSwitch,
  onRename,
  onDelete,
  onPush,
  onPull,
}: {
  branch: GitBranch;
  onSwitch: (branch: string) => void;
  onRename: (branch: GitBranch) => void;
  onDelete: (branch: string, force?: boolean) => void;
  onPush: () => void;
  onPull: () => void;
}) {
  return (
    <>
      {!branch.isCurrent && (
        <ContextMenuItem onSelect={() => onSwitch(branch.name)}>
          <IconGitBranch size={14} />
          Checkout
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => onRename(branch)}>
        <IconPencil size={14} />
        Rename…
      </ContextMenuItem>
      {branch.isCurrent && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onPush}>
            <IconArrowUp size={14} />
            Push
          </ContextMenuItem>
          <ContextMenuItem onSelect={onPull}>
            <IconArrowDown size={14} />
            Pull
          </ContextMenuItem>
        </>
      )}
      {!branch.isCurrent && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDelete(branch.name)}
          >
            <IconTrash size={14} />
            Delete
          </ContextMenuItem>
          {!branch.isMerged && (
            <ContextMenuItem
              variant="destructive"
              onSelect={() => onDelete(branch.name, true)}
            >
              <IconTrash size={14} />
              Force Delete
            </ContextMenuItem>
          )}
        </>
      )}
    </>
  );
}

function RemoteBranchMenu({
  branch,
  onSwitch,
  onDeleteRemote,
}: {
  branch: GitBranch;
  onSwitch: (branch: string) => void;
  onDeleteRemote: (remote: string, branch: string) => void;
}) {
  const idx = branch.name.indexOf("/");
  const remote = idx >= 0 ? branch.name.slice(0, idx) : "origin";
  const branchName = idx >= 0 ? branch.name.slice(idx + 1) : branch.name;

  return (
    <>
      <ContextMenuItem onSelect={() => onSwitch(branchName)}>
        <IconGitBranch size={14} />
        Checkout (create local)
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onDeleteRemote(remote, branchName)}
      >
        <IconTrash size={14} />
        Delete from remote
      </ContextMenuItem>
    </>
  );
}
