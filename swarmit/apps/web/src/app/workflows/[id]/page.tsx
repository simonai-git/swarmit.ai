'use client';

import { useState, useEffect, useCallback, use } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, Upload, CheckCircle, AlertTriangle, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api, type Workflow } from '@/lib/api';

// ─── Custom Node Components ───────────────────────────────

function StartNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium shadow-lg min-w-[80px] text-center">
      {String(data.label || 'Start')}
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3" />
    </div>
  );
}

function EndNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium shadow-lg min-w-[80px] text-center">
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-3 !h-3" />
      {String(data.label || 'End')}
    </div>
  );
}

function InstructionNode({ data, selected }: NodeProps) {
  return (
    <div className={`px-4 py-3 bg-zinc-800 border-2 ${selected ? 'border-blue-500' : 'border-zinc-600'} rounded-lg shadow-lg min-w-[180px] max-w-[280px]`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <div className="text-sm font-medium text-white">{String(data.label || '')}</div>
      {data.instructions ? (
        <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{String(data.instructions)}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  return (
    <div className={`px-4 py-3 bg-zinc-800 border-2 ${selected ? 'border-yellow-500' : 'border-yellow-600/50'} rounded-lg shadow-lg min-w-[180px] max-w-[280px]`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400 !w-3 !h-3" />
      <div className="text-sm font-medium text-yellow-400">{'\u2666'} {String(data.label || '')}</div>
      {data.condition ? (
        <div className="text-xs text-zinc-400 mt-1 font-mono">{String(data.condition)}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-400 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-400 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

function CheckpointNode({ data, selected }: NodeProps) {
  return (
    <div className={`px-4 py-2 bg-zinc-800 border-2 ${selected ? 'border-purple-500' : 'border-purple-600/50'} rounded-lg shadow-lg min-w-[120px] text-center`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <div className="text-sm font-medium text-purple-400">{String(data.label || '')}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  instruction: InstructionNode,
  condition: ConditionNode,
  checkpoint: CheckpointNode,
};

// ─── Validation Result Type ──────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: Array<{ type: string; message: string; nodeId?: string }>;
  warnings: Array<{ type: string; message: string; nodeId?: string }>;
}

// ─── Page Component ──────────────────────────────────────

export default function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [nodeCounter, setNodeCounter] = useState(1);

  // Load workflow
  useEffect(() => {
    (async () => {
      try {
        const data = await api.workflows.get(id);
        setWorkflow(data);

        // Load nodes/edges from latest version
        const latestVersion = data.versions?.[0];
        if (latestVersion) {
          const versionNodes = latestVersion.nodes as Node[];
          const versionEdges = (latestVersion.edges as Edge[]) || [];
          setNodes(versionNodes || []);
          // Apply edge labels to loaded edges from condition nodes
          const loadedEdges = versionEdges.map(e => {
            const label = e.sourceHandle === 'true' ? 'Yes' : e.sourceHandle === 'false' ? 'No' : undefined;
            if (label && !e.label) {
              return {
                ...e,
                label,
                labelStyle: { fill: '#a1a1aa', fontSize: 12 },
                labelBgStyle: { fill: '#18181b' },
                labelBgPadding: [6, 4] as [number, number],
              };
            }
            return e;
          });
          setEdges(loadedEdges);
          // Find highest existing node counter
          const maxNum = (versionNodes || []).reduce((max: number, n: Node) => {
            const match = n.id.match(/-(\d+)$/);
            return match ? Math.max(max, parseInt(match[1])) : max;
          }, 0);
          setNodeCounter(maxNum + 1);
        } else {
          // New workflow: initialize with default start + end nodes
          setNodes([
            { id: 'start-0', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start' } },
            { id: 'end-0', type: 'end', position: { x: 250, y: 400 }, data: { label: 'End' } },
          ]);
          setEdges([{
            id: 'e-start-end-default',
            source: 'start-0',
            target: 'end-0',
            style: { stroke: '#52525b', strokeWidth: 2 },
            type: 'smoothstep',
          }]);
        }
      } catch (err) {
        console.error('Failed to load workflow:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds));
    setHasUnsavedChanges(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
    setHasUnsavedChanges(true);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const label = connection.sourceHandle === 'true' ? 'Yes' : connection.sourceHandle === 'false' ? 'No' : undefined;
    setEdges(eds => addEdge({
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      ...(label ? {
        label,
        labelStyle: { fill: '#a1a1aa', fontSize: 12 },
        labelBgStyle: { fill: '#18181b' },
        labelBgPadding: [6, 4] as [number, number],
      } : {}),
    }, eds));
    setHasUnsavedChanges(true);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && selectedNode.type !== 'start' && selectedNode.type !== 'end') {
          deleteSelectedNode();
        }
      }
      if (e.key === 'Escape') {
        setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !saving) handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasUnsavedChanges, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const addNode = (type: string) => {
    const labels: Record<string, string> = {
      instruction: 'New Step',
      condition: 'Condition',
      checkpoint: 'Checkpoint',
    };
    const newNode: Node = {
      id: `${type}-${nodeCounter}`,
      type,
      position: { x: 250, y: 200 + nodeCounter * 80 },
      data: { label: labels[type] || type },
    };
    setNodes(nds => [...nds, newNode]);
    setNodeCounter(c => c + 1);
    setSelectedNode(newNode);
    setHasUnsavedChanges(true);
  };

  const deleteSelectedNode = () => {
    if (!selectedNode || selectedNode.type === 'start' || selectedNode.type === 'end') return;
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    setHasUnsavedChanges(true);
  };

  const updateNodeData = (field: string, value: string) => {
    if (!selectedNode) return;
    setNodes(nds => nds.map(n => {
      if (n.id === selectedNode.id) {
        const updated = { ...n, data: { ...n.data, [field]: value } };
        setSelectedNode(updated);
        return updated;
      }
      return n;
    }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      await api.workflows.saveVersion(id, nodes, edges);
      setHasUnsavedChanges(false);
      toast.success('Workflow saved');
    } catch (err) {
      console.error('Failed to save:', err);
      toast.error('Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    try {
      const result = await api.workflows.validate(id, nodes, edges);
      setValidation(result);
      if (result.valid) {
        toast.success('Workflow is valid');
      } else {
        toast.error(`Validation failed: ${result.errors.length} error(s)`);
      }
    } catch (err) {
      console.error('Failed to validate:', err);
      toast.error('Failed to validate workflow');
    }
  };

  const handlePublish = async () => {
    if (!workflow) return;
    // Save first if unsaved changes
    if (hasUnsavedChanges) {
      await handleSave();
    }
    setPublishing(true);
    try {
      await api.workflows.publish(id);
      setWorkflow(prev => prev ? { ...prev, isPublished: true } : prev);
      setValidation(null);
      toast.success('Workflow published');
    } catch (err) {
      console.error('Failed to publish:', err);
      toast.error('Failed to publish workflow');
      if (err instanceof Error && 'body' in err) {
        const body = (err as { body: { details?: ValidationResult } }).body;
        if (body?.details) {
          setValidation({
            valid: false,
            errors: body.details as unknown as ValidationResult['errors'],
            warnings: [],
          });
        }
      }
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-[600px] bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-8">
        <p className="text-zinc-400">Workflow not found</p>
        <Link href="/workflows" className="text-blue-400 hover:underline mt-2 inline-block">Back to workflows</Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-4">
          <Link href="/workflows" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-white">{workflow.name}</h1>
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-400">Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Add node buttons */}
          <div className="flex items-center gap-1 mr-4 border-r border-zinc-700 pr-4">
            <button
              onClick={() => addNode('instruction')}
              className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Step
            </button>
            <button
              onClick={() => addNode('condition')}
              className="px-3 py-1.5 text-xs bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 rounded transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Condition
            </button>
            <button
              onClick={() => addNode('checkpoint')}
              className="px-3 py-1.5 text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Checkpoint
            </button>
          </div>

          <button
            onClick={handleValidate}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-1"
          >
            <CheckCircle className="w-4 h-4" /> Validate
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded transition-colors flex items-center gap-1"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors flex items-center gap-1"
          >
            <Upload className="w-4 h-4" /> {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Validation messages */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-700 space-y-1">
          {validation.errors.map((e, i) => (
            <div key={`err-${i}`} className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {e.message}
            </div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={`warn-${i}`} className="flex items-center gap-2 text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex">
        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-zinc-950"
            defaultEdgeOptions={{
              style: { stroke: '#52525b', strokeWidth: 2 },
              type: 'smoothstep',
            }}
          >
            <Controls className="!bg-zinc-800 !border-zinc-600 [&>button]:!bg-zinc-700 [&>button]:!border-zinc-600 [&>button]:!text-zinc-300" />
            <MiniMap
              className="!bg-zinc-800 !border-zinc-600"
              nodeColor={(n) => {
                switch (n.type) {
                  case 'start': return '#16a34a';
                  case 'end': return '#dc2626';
                  case 'condition': return '#eab308';
                  case 'checkpoint': return '#a855f7';
                  default: return '#3b82f6';
                }
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
          </ReactFlow>
        </div>

        {/* Properties panel */}
        {selectedNode && (
          <div className="w-80 bg-zinc-900 border-l border-zinc-700 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Properties</h2>
              {selectedNode.type !== 'start' && selectedNode.type !== 'end' && (
                <button
                  onClick={deleteSelectedNode}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  title="Delete node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Type</label>
                <div className="px-3 py-1.5 bg-zinc-800 rounded text-sm text-zinc-300 capitalize">
                  {selectedNode.type}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Label</label>
                <input
                  type="text"
                  value={String(selectedNode.data.label || '')}
                  onChange={e => updateNodeData('label', e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {(selectedNode.type === 'instruction' || selectedNode.type === 'checkpoint') && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Instructions</label>
                  <textarea
                    value={String(selectedNode.data.instructions || '')}
                    onChange={e => updateNodeData('instructions', e.target.value)}
                    rows={6}
                    placeholder="What should the agent do in this step?"
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Condition Expression</label>
                  <input
                    type="text"
                    value={String(selectedNode.data.condition || '')}
                    onChange={e => updateNodeData('condition', e.target.value)}
                    placeholder="e.g., task.status == 'testing'"
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="mt-2 text-xs text-zinc-500 space-y-1">
                    <p>Supported prefixes: <code className="text-zinc-400">task.</code> <code className="text-zinc-400">run.</code> <code className="text-zinc-400">variable.</code></p>
                    <p>Operators: <code className="text-zinc-400">==</code> <code className="text-zinc-400">!=</code> <code className="text-zinc-400">&gt;</code> <code className="text-zinc-400">&lt;</code> <code className="text-zinc-400">contains</code></p>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-zinc-700">
                <p className="text-xs text-zinc-500">ID: {selectedNode.id}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
