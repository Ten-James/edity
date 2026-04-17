import type { GitBranch } from "@/types/git";

export interface BranchPair {
  local: GitBranch | null;
  remote: GitBranch | null;
  key: string;
}

export interface PrefixGroup {
  prefix: string;
  pairs: BranchPair[];
}

/**
 * Strip remote prefix from branch name.
 * "origin/feature/foo" → "feature/foo"
 */
function stripRemote(name: string): string {
  const idx = name.indexOf("/");
  return idx >= 0 ? name.slice(idx + 1) : name;
}

/**
 * Pair local branches with their remote counterparts.
 * Matching: local.upstream (primary), then origin/<localName> (fallback).
 */
export function pairBranches(branches: GitBranch[]): BranchPair[] {
  const locals = branches.filter((b) => !b.isRemote);
  const remoteMap = new Map<string, GitBranch>();
  for (const b of branches) {
    if (b.isRemote) remoteMap.set(b.name, b);
  }

  const pairs: BranchPair[] = [];
  const matchedRemotes = new Set<string>();

  for (const local of locals) {
    let remote: GitBranch | null = null;

    // Primary: match via upstream
    if (local.upstream && remoteMap.has(local.upstream)) {
      remote = remoteMap.get(local.upstream)!;
      matchedRemotes.add(remote.name);
    }

    // Fallback: match by convention origin/<name>
    if (!remote) {
      const candidate = `origin/${local.name}`;
      if (remoteMap.has(candidate)) {
        remote = remoteMap.get(candidate)!;
        matchedRemotes.add(remote.name);
      }
    }

    pairs.push({ local, remote, key: local.name });
  }

  // Unpaired remotes
  for (const [name, remote] of remoteMap) {
    if (!matchedRemotes.has(name)) {
      pairs.push({ local: null, remote, key: stripRemote(name) });
    }
  }

  pairs.sort((a, b) => a.key.localeCompare(b.key));
  return pairs;
}

/**
 * Extract prefix from branch key (part before first /).
 * "feature/foo" → "feature/"
 * "main" → ""
 */
function getPrefix(key: string): string {
  const idx = key.indexOf("/");
  return idx >= 0 ? key.slice(0, idx + 1) : "";
}

/**
 * Group pairs by prefix. Only create group if 2+ members.
 * Ungrouped pairs first, then groups sorted alphabetically.
 */
export function groupPairsByPrefix(pairs: BranchPair[]): PrefixGroup[] {
  const buckets = new Map<string, BranchPair[]>();

  for (const pair of pairs) {
    const prefix = getPrefix(pair.key);
    if (!buckets.has(prefix)) buckets.set(prefix, []);
    buckets.get(prefix)!.push(pair);
  }

  const ungrouped: BranchPair[] = [];
  const groups: PrefixGroup[] = [];

  for (const [prefix, items] of buckets) {
    if (prefix === "" || items.length < 2) {
      ungrouped.push(...items);
    } else {
      groups.push({ prefix, pairs: items });
    }
  }

  ungrouped.sort((a, b) => a.key.localeCompare(b.key));
  groups.sort((a, b) => a.prefix.localeCompare(b.prefix));

  return [
    ...(ungrouped.length > 0 ? [{ prefix: "", pairs: ungrouped }] : []),
    ...groups,
  ];
}
