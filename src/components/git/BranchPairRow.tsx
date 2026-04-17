import { IconLink } from "@tabler/icons-react";
import { BranchCell } from "./BranchCell";
import type { BranchPair } from "@/lib/branch-utils";
import type { GitBranch } from "@/types/git";

interface BranchPairRowProps {
  pair: BranchPair;
  stripPrefix: string;
  onSwitch: (branch: string) => void;
  onRename: (branch: GitBranch) => void;
  onDelete: (branch: string, force?: boolean) => void;
  onDeleteRemote: (remote: string, branch: string) => void;
  onPush: () => void;
  onPull: () => void;
}

function getDisplayName(name: string, stripPrefix: string): string {
  if (stripPrefix && name.startsWith(stripPrefix)) {
    return name.slice(stripPrefix.length);
  }
  return name;
}

function getRemoteDisplayName(name: string, stripPrefix: string): string {
  // Strip "origin/" first, then the group prefix
  const idx = name.indexOf("/");
  const withoutRemote = idx >= 0 ? name.slice(idx + 1) : name;
  if (stripPrefix && withoutRemote.startsWith(stripPrefix)) {
    return withoutRemote.slice(stripPrefix.length);
  }
  return withoutRemote;
}

export function BranchPairRow({
  pair,
  stripPrefix,
  onSwitch,
  onRename,
  onDelete,
  onDeleteRemote,
  onPush,
  onPull,
}: BranchPairRowProps) {
  const hasBoth = pair.local !== null && pair.remote !== null;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
      <div className="min-w-0">
        {pair.local && (
          <BranchCell
            branch={pair.local}
            displayName={getDisplayName(pair.local.name, stripPrefix)}
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
            onDeleteRemote={onDeleteRemote}
            onPush={onPush}
            onPull={onPull}
          />
        )}
      </div>

      <div className="flex items-center px-0.5 w-5 justify-center">
        {hasBoth && (
          <IconLink size={10} className="text-muted-foreground/40" />
        )}
      </div>

      <div className="min-w-0">
        {pair.remote && (
          <BranchCell
            branch={pair.remote}
            displayName={getRemoteDisplayName(pair.remote.name, stripPrefix)}
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
            onDeleteRemote={onDeleteRemote}
            onPush={onPush}
            onPull={onPull}
          />
        )}
      </div>
    </div>
  );
}
