import { NextRequest } from 'next/server';
import { getTask, getTaskLogs } from '@/lib/db';
import { taskLogBuffer, BufferedLogEntry } from '@/lib/task-log-buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  const task = await getTask(taskId);
  if (!task) {
    return new Response(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const isClosed = { value: false };
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const abortHandler = () => {
    isClosed.value = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  if (request.signal.aborted) {
    return new Response(null, { status: 499 });
  }

  request.signal.addEventListener('abort', abortHandler);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string): boolean => {
        if (isClosed.value) return false;
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          isClosed.value = true;
          return false;
        }
      };

      // 1. Send historical logs from DB
      try {
        const historyLogs = await getTaskLogs(taskId, { limit: 500 });
        if (!enqueue(`event: history\ndata: ${JSON.stringify(historyLogs)}\n\n`)) return;
      } catch (err) {
        console.error('[LogsSSE] Failed to load history:', err);
      }

      // 2. Send any buffered entries not yet flushed to DB
      const buffered = taskLogBuffer.getBuffered(taskId);
      if (buffered.length > 0) {
        if (!enqueue(`event: buffered\ndata: ${JSON.stringify(buffered)}\n\n`)) return;
      }

      // 3. Subscribe to live log entries
      unsubscribe = taskLogBuffer.subscribe(taskId, (entry: BufferedLogEntry) => {
        enqueue(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      });

      // 4. Heartbeat every 15s
      heartbeatInterval = setInterval(() => {
        if (!enqueue(`: heartbeat\n\n`)) {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, 15000);
    },

    cancel() {
      abortHandler();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
