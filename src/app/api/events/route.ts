import { NextRequest } from 'next/server';
import { getAllTasks, getWatcherConfig } from '@/lib/db';

// SSE endpoint for real-time updates
// Uses server-side polling to check for changes and streams them to clients

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Track last known state hash for change detection
let lastTasksHash = '';
let lastWatcherHash = '';

function hashState(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Safely enqueue data to the SSE controller.
 * Returns false if the controller is closed or an error occurs.
 */
function safeEnqueue(
  controller: ReadableStreamDefaultController,
  data: Uint8Array,
  isClosed: { value: boolean }
): boolean {
  if (isClosed.value) {
    return false;
  }
  
  try {
    controller.enqueue(data);
    return true;
  } catch (error) {
    // Controller was closed between check and enqueue
    if (error instanceof TypeError && (error as NodeJS.ErrnoException).code === 'ERR_INVALID_STATE') {
      isClosed.value = true;
      return false;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Track stream state - using object for reference semantics
  const isClosed = { value: false };
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  
  // Set up abort handler early to catch disconnections
  const abortHandler = () => {
    isClosed.value = true;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
  
  // Check if already aborted before starting
  if (request.signal.aborted) {
    return new Response(null, { status: 499 }); // Client Closed Request
  }
  
  request.signal.addEventListener('abort', abortHandler);
  
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      if (!safeEnqueue(controller, encoder.encode(`event: connected\ndata: {"status":"connected"}\n\n`), isClosed)) {
        return;
      }
      
      // Send initial data
      try {
        const [tasks, watcher] = await Promise.all([
          getAllTasks(),
          getWatcherConfig()
        ]);
        
        if (!safeEnqueue(controller, encoder.encode(`event: tasks\ndata: ${JSON.stringify(tasks)}\n\n`), isClosed)) {
          return;
        }
        if (!safeEnqueue(controller, encoder.encode(`event: watcher\ndata: ${JSON.stringify(watcher)}\n\n`), isClosed)) {
          return;
        }
        
        lastTasksHash = hashState(tasks.map(t => ({ id: t.id, status: t.status, updated_at: t.updated_at })));
        lastWatcherHash = hashState(watcher);
      } catch (error) {
        console.error('SSE initial data error:', error);
        if (isClosed.value) return;
      }
      
      // Poll for changes every 2 seconds
      pollInterval = setInterval(async () => {
        // Early exit if closed
        if (isClosed.value) {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          return;
        }
        
        try {
          const [tasks, watcher] = await Promise.all([
            getAllTasks(),
            getWatcherConfig()
          ]);
          
          // Check again after async operation
          if (isClosed.value) return;
          
          // Check for task changes
          const currentTasksHash = hashState(tasks.map(t => ({ id: t.id, status: t.status, updated_at: t.updated_at })));
          if (currentTasksHash !== lastTasksHash) {
            if (!safeEnqueue(controller, encoder.encode(`event: tasks\ndata: ${JSON.stringify(tasks)}\n\n`), isClosed)) {
              return;
            }
            lastTasksHash = currentTasksHash;
          }
          
          // Check for watcher changes
          const currentWatcherHash = hashState(watcher);
          if (currentWatcherHash !== lastWatcherHash) {
            if (!safeEnqueue(controller, encoder.encode(`event: watcher\ndata: ${JSON.stringify(watcher)}\n\n`), isClosed)) {
              return;
            }
            lastWatcherHash = currentWatcherHash;
          }
          
          // Send heartbeat to keep connection alive
          safeEnqueue(controller, encoder.encode(`: heartbeat\n\n`), isClosed);
          
        } catch (error) {
          // Only log if not a closed controller error
          if (!isClosed.value) {
            console.error('SSE polling error:', error);
          }
        }
      }, 2000);
    },
    
    cancel() {
      // Called when the stream is cancelled (e.g., client disconnects)
      isClosed.value = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
}
