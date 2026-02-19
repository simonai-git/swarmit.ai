'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

interface ExecutionEvent {
  nodeId: string;
  type: string;
  nodeLabel: string | null;
  createdAt: string;
}

interface Props {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  currentNodeId: string | null;
  completedNodes: string[];
  status: string;
  events?: ExecutionEvent[];
}

// ─── Execution-aware node components ────────────────────────

type ExecState = 'completed' | 'running' | 'failed' | 'pending';

function getNodeExecState(
  nodeId: string,
  currentNodeId: string | null,
  completedNodes: string[],
  workflowStatus: string,
): ExecState {
  if (completedNodes.includes(nodeId)) return 'completed';
  if (nodeId === currentNodeId) {
    return workflowStatus === 'FAILED' ? 'failed' : 'running';
  }
  return 'pending';
}

const EXEC_BORDER: Record<ExecState, string> = {
  completed: 'border-green-500',
  running: 'border-blue-500 animate-pulse',
  failed: 'border-red-500',
  pending: 'border-zinc-700',
};

const EXEC_ICON: Record<ExecState, React.ReactNode> = {
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  running: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  pending: null,
};

function ExecStartNode({ data }: NodeProps) {
  const state = (data._execState as ExecState) || 'pending';
  const borderClass = state === 'pending' ? '' : `ring-2 ring-offset-1 ring-offset-zinc-950 ${state === 'completed' ? 'ring-green-500' : state === 'running' ? 'ring-blue-500 animate-pulse' : 'ring-red-500'}`;
  return (
    <div className={`px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium shadow-lg min-w-[80px] text-center ${borderClass}`}>
      <div className="flex items-center justify-center gap-1.5">
        {EXEC_ICON[state]}
        {String(data.label || 'Start')}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3" />
    </div>
  );
}

function ExecEndNode({ data }: NodeProps) {
  const state = (data._execState as ExecState) || 'pending';
  const borderClass = state === 'pending' ? '' : `ring-2 ring-offset-1 ring-offset-zinc-950 ${state === 'completed' ? 'ring-green-500' : state === 'running' ? 'ring-blue-500 animate-pulse' : 'ring-red-500'}`;
  return (
    <div className={`px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium shadow-lg min-w-[80px] text-center ${borderClass}`}>
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-3 !h-3" />
      <div className="flex items-center justify-center gap-1.5">
        {EXEC_ICON[state]}
        {String(data.label || 'End')}
      </div>
    </div>
  );
}

function ExecInstructionNode({ data }: NodeProps) {
  const state = (data._execState as ExecState) || 'pending';
  const opacity = state === 'pending' ? 'opacity-50' : '';
  return (
    <div className={`px-4 py-3 bg-zinc-800 border-2 ${EXEC_BORDER[state]} rounded-lg shadow-lg min-w-[180px] max-w-[280px] ${opacity}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <div className="flex items-center gap-1.5">
        {EXEC_ICON[state]}
        <span className="text-sm font-medium text-white">{String(data.label || '')}</span>
      </div>
      {data.instructions ? (
        <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{String(data.instructions)}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  );
}

function ExecConditionNode({ data }: NodeProps) {
  const state = (data._execState as ExecState) || 'pending';
  const opacity = state === 'pending' ? 'opacity-50' : '';
  return (
    <div className={`px-4 py-3 bg-zinc-800 border-2 ${EXEC_BORDER[state]} rounded-lg shadow-lg min-w-[180px] max-w-[280px] ${opacity}`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400 !w-3 !h-3" />
      <div className="flex items-center gap-1.5">
        {EXEC_ICON[state]}
        <span className="text-sm font-medium text-yellow-400">{'\u2666'} {String(data.label || '')}</span>
      </div>
      {data.condition ? (
        <div className="text-xs text-zinc-400 mt-1 font-mono">{String(data.condition)}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-400 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-400 !w-3 !h-3 !left-[70%]" />
    </div>
  );
}

function ExecCheckpointNode({ data }: NodeProps) {
  const state = (data._execState as ExecState) || 'pending';
  const opacity = state === 'pending' ? 'opacity-50' : '';
  return (
    <div className={`px-4 py-2 bg-zinc-800 border-2 ${EXEC_BORDER[state]} rounded-lg shadow-lg min-w-[120px] text-center ${opacity}`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <div className="flex items-center justify-center gap-1.5">
        {EXEC_ICON[state]}
        <span className="text-sm font-medium text-purple-400">{String(data.label || '')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  );
}

const execNodeTypes = {
  start: ExecStartNode,
  end: ExecEndNode,
  instruction: ExecInstructionNode,
  condition: ExecConditionNode,
  checkpoint: ExecCheckpointNode,
};

// ─── Main Component ─────────────────────────────────────────

export default function WorkflowExecutionViewer({
  nodes: rawNodes,
  edges: rawEdges,
  currentNodeId,
  completedNodes,
  status,
  events,
}: Props) {
  const nodes: Node[] = useMemo(
    () =>
      rawNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _execState: getNodeExecState(n.id, currentNodeId, completedNodes, status),
        },
        draggable: false,
        selectable: false,
        connectable: false,
      })),
    [rawNodes, currentNodeId, completedNodes, status],
  );

  const edges: Edge[] = useMemo(
    () =>
      rawEdges.map((e) => ({
        ...e,
        type: 'smoothstep',
        style: { stroke: '#52525b', strokeWidth: 2 },
        animated: e.source === currentNodeId,
      })),
    [rawEdges, currentNodeId],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[350px] rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={execNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
          <Controls
            showInteractive={false}
            className="!bg-zinc-800 !border-zinc-600 [&>button]:!bg-zinc-700 [&>button]:!border-zinc-600 [&>button]:!text-zinc-300"
          />
        </ReactFlow>
      </div>

      {/* Event timeline */}
      {events && events.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-40 overflow-y-auto">
          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Execution Timeline
          </h4>
          <div className="space-y-1">
            {events.map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-600 shrink-0 w-20 text-right tabular-nums">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
                <span className="text-zinc-500 shrink-0 w-20 uppercase">{event.type}</span>
                <span className="text-zinc-300 truncate">
                  {event.nodeLabel || event.nodeId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
