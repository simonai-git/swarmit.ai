import { describe, it, expect } from 'vitest';
import { computeVersionDiff, formatDiffSummary } from '../lib/workflow-diff';

describe('computeVersionDiff', () => {
  it('detects added nodes', () => {
    const older = [{ id: 'n1', data: { label: 'A' } }];
    const newer = [{ id: 'n1', data: { label: 'A' } }, { id: 'n2', data: { label: 'B' } }];
    const diff = computeVersionDiff(older, [], newer, []);
    expect(diff.addedNodes).toHaveLength(1);
    expect(diff.addedNodes[0].id).toBe('n2');
    expect(diff.removedNodes).toHaveLength(0);
  });

  it('detects removed nodes', () => {
    const older = [{ id: 'n1', data: {} }, { id: 'n2', data: {} }];
    const newer = [{ id: 'n1', data: {} }];
    const diff = computeVersionDiff(older, [], newer, []);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0].id).toBe('n2');
  });

  it('detects changed node data', () => {
    const older = [{ id: 'n1', data: { label: 'A' } }];
    const newer = [{ id: 'n1', data: { label: 'B' } }];
    const diff = computeVersionDiff(older, [], newer, []);
    expect(diff.changedNodes).toHaveLength(1);
    expect(diff.changedNodes[0].id).toBe('n1');
    expect(diff.changedNodes[0].fields).toContain('data');
  });

  it('detects changed node position', () => {
    const older = [{ id: 'n1', data: {}, position: { x: 0, y: 0 } }];
    const newer = [{ id: 'n1', data: {}, position: { x: 100, y: 200 } }];
    const diff = computeVersionDiff(older, [], newer, []);
    expect(diff.changedNodes).toHaveLength(1);
    expect(diff.changedNodes[0].fields).toContain('position');
  });

  it('detects added and removed edges', () => {
    const olderEdges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const newerEdges = [{ id: 'e2', source: 'n1', target: 'n3' }];
    const diff = computeVersionDiff([], olderEdges, [], newerEdges);
    expect(diff.addedEdges).toHaveLength(1);
    expect(diff.addedEdges[0].id).toBe('e2');
    expect(diff.removedEdges).toHaveLength(1);
    expect(diff.removedEdges[0].id).toBe('e1');
  });

  it('detects changed edge target', () => {
    const olderEdges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const newerEdges = [{ id: 'e1', source: 'n1', target: 'n3' }];
    const diff = computeVersionDiff([], olderEdges, [], newerEdges);
    expect(diff.changedEdges).toHaveLength(1);
    expect(diff.changedEdges[0].fields).toContain('target');
  });

  it('returns empty diff for identical versions', () => {
    const nodes = [{ id: 'n1', data: { label: 'A' }, position: { x: 0, y: 0 } }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const diff = computeVersionDiff(nodes, edges, nodes, edges);
    expect(diff.addedNodes).toHaveLength(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.changedNodes).toHaveLength(0);
    expect(diff.addedEdges).toHaveLength(0);
    expect(diff.removedEdges).toHaveLength(0);
    expect(diff.changedEdges).toHaveLength(0);
  });
});

describe('formatDiffSummary', () => {
  it('formats a mixed diff', () => {
    const summary = formatDiffSummary({
      addedNodes: [{ id: 'n1' }, { id: 'n2' }],
      removedNodes: [{ id: 'n3' }],
      changedNodes: [{ id: 'n4', fields: ['data'] }, { id: 'n5', fields: ['position'] }, { id: 'n6', fields: ['type'] }],
      addedEdges: [],
      removedEdges: [{ id: 'e1', source: 'a', target: 'b' }],
      changedEdges: [],
    });
    expect(summary).toBe('+2 nodes, -1 node, ~3 nodes, -1 edge');
  });

  it('returns "No changes" for empty diff', () => {
    const summary = formatDiffSummary({
      addedNodes: [],
      removedNodes: [],
      changedNodes: [],
      addedEdges: [],
      removedEdges: [],
      changedEdges: [],
    });
    expect(summary).toBe('No changes');
  });

  it('handles singular correctly', () => {
    const summary = formatDiffSummary({
      addedNodes: [{ id: 'n1' }],
      removedNodes: [],
      changedNodes: [],
      addedEdges: [{ id: 'e1', source: 'a', target: 'b' }],
      removedEdges: [],
      changedEdges: [],
    });
    expect(summary).toBe('+1 node, +1 edge');
  });
});
