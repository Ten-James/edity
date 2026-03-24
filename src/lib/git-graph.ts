import type { GitLogEntry } from "@/types/git";

export interface GraphLine {
  fromCol: number;
  toCol: number;
  color: number;
}

export interface GraphNode {
  hash: string;
  column: number;
  color: number;
  lines: GraphLine[];
}

const GRAPH_COLORS = [
  "#4ec9b0", // teal
  "#ce9178", // orange
  "#569cd6", // blue
  "#c586c0", // purple
  "#dcdcaa", // yellow
  "#9cdcfe", // light blue
  "#d16969", // red
  "#b5cea8", // green
];

/**
 * Assign lanes (columns) and connecting lines for a git commit graph.
 *
 * Each commit occupies a lane. Lanes are reused when branches merge.
 * The algorithm processes commits top-to-bottom (newest first).
 */
export function computeGraph(entries: GitLogEntry[]): GraphNode[] {
  // activeLanes[col] = hash that this lane is waiting to connect to
  const activeLanes: (string | null)[] = [];
  const laneColors = new Map<string, number>();
  let nextColor = 0;

  function getColor(hash: string): number {
    let c = laneColors.get(hash);
    if (c === undefined) {
      c = nextColor % GRAPH_COLORS.length;
      nextColor++;
      laneColors.set(hash, c);
    }
    return c;
  }

  function findLane(hash: string): number {
    return activeLanes.indexOf(hash);
  }

  function nextFreeLane(): number {
    const idx = activeLanes.indexOf(null);
    if (idx !== -1) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  const nodes: GraphNode[] = [];

  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row];
    const lines: GraphLine[] = [];

    // Find which lane this commit occupies
    let col = findLane(entry.hash);
    if (col === -1) {
      col = nextFreeLane();
      activeLanes[col] = entry.hash;
    }

    const color = getColor(entry.hash);

    // Clear this lane (commit is now processed)
    activeLanes[col] = null;

    // Connect parents
    const parents = entry.parentHashes;
    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];

      // Check if parent already has a lane
      let parentCol = findLane(parentHash);
      if (parentCol === -1) {
        if (pi === 0) {
          // First parent reuses this commit's lane
          parentCol = col;
        } else {
          parentCol = nextFreeLane();
        }
        activeLanes[parentCol] = parentHash;
      }

      const parentColor = pi === 0 ? color : getColor(parentHash);
      lines.push({ fromCol: col, toCol: parentCol, color: parentColor });
    }

    // Draw pass-through lines for lanes that aren't involved in this commit
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] !== null && i !== col) {
        const laneHash = activeLanes[i]!;
        const passColor = getColor(laneHash);
        lines.push({ fromCol: i, toCol: i, color: passColor });
      }
    }

    // Compact: trim trailing nulls from activeLanes
    while (
      activeLanes.length > 0 &&
      activeLanes[activeLanes.length - 1] === null
    ) {
      activeLanes.pop();
    }

    nodes.push({ hash: entry.hash, column: col, color, lines });
  }

  return nodes;
}

export function getColorHex(colorIndex: number): string {
  return GRAPH_COLORS[colorIndex % GRAPH_COLORS.length];
}
