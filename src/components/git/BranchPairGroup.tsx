import { useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BranchPairRow } from "./BranchPairRow";
import type { PrefixGroup } from "@/lib/branch-utils";
import type { GitBranch } from "@/types/git";

interface BranchPairGroupProps {
  group: PrefixGroup;
  onSwitch: (branch: string) => void;
  onRename: (branch: GitBranch) => void;
  onDelete: (branch: string, force?: boolean) => void;
  onDeleteRemote: (remote: string, branch: string) => void;
  onPush: () => void;
  onPull: () => void;
}

export function BranchPairGroup({
  group,
  onSwitch,
  onRename,
  onDelete,
  onDeleteRemote,
  onPush,
  onPull,
}: BranchPairGroupProps) {
  // Ungrouped (prefix === "") → render rows directly, no collapsible
  if (!group.prefix) {
    return (
      <div className="space-y-px">
        {group.pairs.map((pair) => (
          <BranchPairRow
            key={pair.key}
            pair={pair}
            stripPrefix=""
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
            onDeleteRemote={onDeleteRemote}
            onPush={onPush}
            onPull={onPull}
          />
        ))}
      </div>
    );
  }

  return <CollapsibleGroup
    group={group}
    onSwitch={onSwitch}
    onRename={onRename}
    onDelete={onDelete}
    onDeleteRemote={onDeleteRemote}
    onPush={onPush}
    onPull={onPull}
  />;
}

function CollapsibleGroup({
  group,
  onSwitch,
  onRename,
  onDelete,
  onDeleteRemote,
  onPush,
  onPull,
}: BranchPairGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 w-full px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent/30 cursor-pointer select-none">
        {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <span>{group.prefix.slice(0, -1)}</span>
        <span className="ml-1 text-[10px] font-normal opacity-60">
          {group.pairs.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-2 space-y-px">
          {group.pairs.map((pair) => (
            <BranchPairRow
              key={pair.key}
              pair={pair}
              stripPrefix={group.prefix}
              onSwitch={onSwitch}
              onRename={onRename}
              onDelete={onDelete}
              onDeleteRemote={onDeleteRemote}
              onPush={onPush}
              onPull={onPull}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
