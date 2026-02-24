export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-500/20 text-zinc-300',
  PLANNING: 'bg-blue-500/20 text-blue-400',
  ACTIVE: 'bg-green-500/20 text-green-400',
  PAUSED: 'bg-yellow-500/20 text-yellow-400',
  COMPLETED: 'bg-zinc-500/20 text-zinc-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-zinc-500/20 text-zinc-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  TESTING: 'bg-purple-500/20 text-purple-400',
  IN_REVIEW: 'bg-yellow-500/20 text-yellow-400',
  DONE: 'bg-green-500/20 text-green-400',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[status] || 'bg-zinc-500/20 text-zinc-400'}`}
    >
      {status}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${TASK_STATUS_COLORS[status] || 'bg-zinc-500/20 text-zinc-400'}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
