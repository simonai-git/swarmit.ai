export interface WorkflowNodeData {
  label: string;
  instructions?: string;
  condition?: string;
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'instruction' | 'condition' | 'checkpoint';
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}
