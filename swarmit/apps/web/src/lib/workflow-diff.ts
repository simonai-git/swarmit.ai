interface DiffNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  [key: string]: unknown;
}

interface DiffEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  [key: string]: unknown;
}

interface NodeChange {
  id: string;
  fields: string[];
}

interface EdgeChange {
  id: string;
  fields: string[];
}

export interface VersionDiff {
  addedNodes: DiffNode[];
  removedNodes: DiffNode[];
  changedNodes: NodeChange[];
  addedEdges: DiffEdge[];
  removedEdges: DiffEdge[];
  changedEdges: EdgeChange[];
}

/**
 * Compare two workflow versions by their node/edge arrays.
 */
export function computeVersionDiff(
  olderNodes: DiffNode[],
  olderEdges: DiffEdge[],
  newerNodes: DiffNode[],
  newerEdges: DiffEdge[],
): VersionDiff {
  const olderNodeMap = new Map(olderNodes.map(n => [n.id, n]));
  const newerNodeMap = new Map(newerNodes.map(n => [n.id, n]));
  const olderEdgeMap = new Map(olderEdges.map(e => [e.id, e]));
  const newerEdgeMap = new Map(newerEdges.map(e => [e.id, e]));

  const addedNodes = newerNodes.filter(n => !olderNodeMap.has(n.id));
  const removedNodes = olderNodes.filter(n => !newerNodeMap.has(n.id));

  const changedNodes: NodeChange[] = [];
  for (const node of newerNodes) {
    const old = olderNodeMap.get(node.id);
    if (!old) continue;
    const fields: string[] = [];
    if (JSON.stringify(old.data) !== JSON.stringify(node.data)) fields.push('data');
    if (JSON.stringify(old.position) !== JSON.stringify(node.position)) fields.push('position');
    if (old.type !== node.type) fields.push('type');
    if (fields.length > 0) changedNodes.push({ id: node.id, fields });
  }

  const addedEdges = newerEdges.filter(e => !olderEdgeMap.has(e.id));
  const removedEdges = olderEdges.filter(e => !newerEdgeMap.has(e.id));

  const changedEdges: EdgeChange[] = [];
  for (const edge of newerEdges) {
    const old = olderEdgeMap.get(edge.id);
    if (!old) continue;
    const fields: string[] = [];
    if (old.source !== edge.source) fields.push('source');
    if (old.target !== edge.target) fields.push('target');
    if (old.sourceHandle !== edge.sourceHandle) fields.push('sourceHandle');
    if (fields.length > 0) changedEdges.push({ id: edge.id, fields });
  }

  return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges, changedEdges };
}

/**
 * Format a diff summary as human-readable string.
 */
export function formatDiffSummary(diff: VersionDiff): string {
  const parts: string[] = [];

  if (diff.addedNodes.length > 0) parts.push(`+${diff.addedNodes.length} node${diff.addedNodes.length > 1 ? 's' : ''}`);
  if (diff.removedNodes.length > 0) parts.push(`-${diff.removedNodes.length} node${diff.removedNodes.length > 1 ? 's' : ''}`);
  if (diff.changedNodes.length > 0) parts.push(`~${diff.changedNodes.length} node${diff.changedNodes.length > 1 ? 's' : ''}`);
  if (diff.addedEdges.length > 0) parts.push(`+${diff.addedEdges.length} edge${diff.addedEdges.length > 1 ? 's' : ''}`);
  if (diff.removedEdges.length > 0) parts.push(`-${diff.removedEdges.length} edge${diff.removedEdges.length > 1 ? 's' : ''}`);
  if (diff.changedEdges.length > 0) parts.push(`~${diff.changedEdges.length} edge${diff.changedEdges.length > 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
