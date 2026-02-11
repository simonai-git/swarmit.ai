export interface SocketEvents {
  // Server → Client
  'tasks:updated': { taskId: string; userId: string };
  'task:log': { taskId: string; runId: string; stream: string; content: string };
  'project:updated': { projectId: string; userId: string };
  'workflow:execution': {
    runId: string;
    taskId: string;
    nodeId: string;
    type: string;
    nodeLabel?: string;
  };

  // Client → Server
  'task:subscribe': { taskId: string };
  'task:unsubscribe': { taskId: string };
  'project:subscribe': { projectId: string };
  'project:unsubscribe': { projectId: string };
}
