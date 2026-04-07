import type {
  DropZone,
  LayoutNode,
  LeafNode,
  Pane,
  SplitDirection,
  SplitNode,
  Tab,
} from "@/types/tab";

// ─── Constructors ──────────────────────────────────────────────

export function makePane(tabs?: Tab[]): Pane {
  const paneTabs = tabs ?? [];
  return {
    id: crypto.randomUUID(),
    tabs: paneTabs,
    activeTabId: paneTabs[0]?.id ?? null,
  };
}

export function makeLeaf(pane: Pane): LeafNode {
  return { type: "leaf", pane };
}

export function makeSplit(
  orientation: SplitDirection,
  first: LayoutNode,
  second: LayoutNode,
): SplitNode {
  return {
    type: "split",
    id: crypto.randomUUID(),
    orientation,
    children: [first, second],
  };
}

// ─── Read-only walks ───────────────────────────────────────────

/** Collect every leaf in pre-order. Returned as a plain array because
 *  call sites need both iteration AND `.length` / index access; lazy
 *  iterators forced awkward `[...iterateLeaves()].length` chains. */
export function getLeaves(node: LayoutNode): LeafNode[] {
  if (node.type === "leaf") return [node];
  return [...getLeaves(node.children[0]), ...getLeaves(node.children[1])];
}

/** Convenience — first leaf in pre-order, or null if the tree is empty. */
export function firstLeaf(node: LayoutNode): LeafNode | null {
  return getLeaves(node)[0] ?? null;
}

/** Flatten the tree to a list of panes — used by consumers that don't
 *  care about layout structure (e.g. Claude store, command palette). */
export function flattenPanes(node: LayoutNode): Pane[] {
  return getLeaves(node).map((l) => l.pane);
}

export function countLeaves(node: LayoutNode): number {
  return getLeaves(node).length;
}

export function findLeafByPaneId(
  node: LayoutNode,
  paneId: string,
): LeafNode | null {
  for (const leaf of getLeaves(node)) {
    if (leaf.pane.id === paneId) return leaf;
  }
  return null;
}

export function findLeafByTabId(
  node: LayoutNode,
  tabId: string,
): LeafNode | null {
  for (const leaf of getLeaves(node)) {
    if (leaf.pane.tabs.some((t) => t.id === tabId)) return leaf;
  }
  return null;
}

// ─── Mutations (immutable updates) ─────────────────────────────

/** Replace one specific leaf (matched by paneId) with a new node. */
export function replaceLeaf(
  node: LayoutNode,
  paneId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.type === "leaf") {
    return node.pane.id === paneId ? replacement : node;
  }
  const left = replaceLeaf(node.children[0], paneId, replacement);
  const right = replaceLeaf(node.children[1], paneId, replacement);
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

/** Update the Pane stored at the leaf with `paneId`. */
export function updatePane(
  node: LayoutNode,
  paneId: string,
  updater: (pane: Pane) => Pane,
): LayoutNode {
  return mapPanes(node, (pane) => (pane.id === paneId ? updater(pane) : pane));
}

/** Apply a transform to every pane in the tree. */
export function mapPanes(
  node: LayoutNode,
  fn: (pane: Pane) => Pane,
): LayoutNode {
  if (node.type === "leaf") {
    const next = fn(node.pane);
    return next === node.pane ? node : { type: "leaf", pane: next };
  }
  const left = mapPanes(node.children[0], fn);
  const right = mapPanes(node.children[1], fn);
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

/**
 * Remove a leaf from the tree. If the leaf's parent split would be left
 * with only one child, the parent collapses and the surviving child takes
 * its place — this keeps every split node binary, as the type requires.
 *
 * Returns null if removing the leaf would empty the tree (caller must
 * decide what to do — usually, replace it with a fresh empty pane).
 */
export function removeLeaf(
  node: LayoutNode,
  paneId: string,
): LayoutNode | null {
  if (node.type === "leaf") {
    return node.pane.id === paneId ? null : node;
  }
  const left = removeLeaf(node.children[0], paneId);
  const right = removeLeaf(node.children[1], paneId);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

/**
 * Split a leaf into a new split node. The new pane is placed on one side
 * of the existing leaf based on the drop zone:
 *   - top    → vertical split, new pane above
 *   - bottom → vertical split, new pane below
 *   - left   → horizontal split, new pane left
 *   - right  → horizontal split, new pane right
 *
 * Returns the new tree. The original leaf keeps its identity (and pane id),
 * so terminal/file content stays mounted via the TabHost portal.
 */
export function splitLeafByZone(
  node: LayoutNode,
  targetPaneId: string,
  zone: Exclude<DropZone, "center">,
  newPane: Pane,
): LayoutNode {
  const target = findLeafByPaneId(node, targetPaneId);
  if (!target) return node;

  const orientation: SplitDirection =
    zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const newLeaf = makeLeaf(newPane);
  const placeBefore = zone === "top" || zone === "left";
  const split = makeSplit(
    orientation,
    placeBefore ? newLeaf : target,
    placeBefore ? target : newLeaf,
  );
  return replaceLeaf(node, targetPaneId, split);
}
