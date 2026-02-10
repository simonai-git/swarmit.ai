'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Task, WatcherConfig } from '@/lib/db';

interface UseRealtimeUpdatesOptions {
  onTasksUpdate?: (tasks: Task[]) => void;
  onWatcherUpdate?: (watcher: WatcherConfig) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
  userId?: string;
}

export function useRealtimeUpdates({
  onTasksUpdate,
  onWatcherUpdate,
  onConnect,
  onDisconnect,
  enabled = true,
  userId,
}: UseRealtimeUpdatesOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  // Use ref to allow self-reference in reconnect logic
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    // Only run in browser environment
    if (typeof window === 'undefined' || !enabled) return;
    
    setConnectionState('connecting');
    
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const sseUrl = userId ? `/api/events?user=${encodeURIComponent(userId)}` : '/api/events';
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;
    
    eventSource.addEventListener('connected', () => {
      console.log('🔌 SSE connected');
      reconnectAttempts.current = 0;
      setConnectionState('connected');
      onConnect?.();
    });
    
    eventSource.addEventListener('tasks', (event) => {
      try {
        const tasks = JSON.parse(event.data) as Task[];
        onTasksUpdate?.(tasks);
      } catch (error) {
        console.error('Failed to parse tasks event:', error);
      }
    });
    
    eventSource.addEventListener('watcher', (event) => {
      try {
        const watcher = JSON.parse(event.data) as WatcherConfig;
        onWatcherUpdate?.(watcher);
      } catch (error) {
        console.error('Failed to parse watcher event:', error);
      }
    });
    
    eventSource.onerror = () => {
      console.warn('SSE error, reconnecting...');
      eventSource.close();
      setConnectionState('disconnected');
      onDisconnect?.();
      
      // Exponential backoff reconnect
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
          30000 // Max 30 seconds
        );
        reconnectAttempts.current++;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`🔄 Reconnecting (attempt ${reconnectAttempts.current})...`);
          connectRef.current();
        }, delay);
      } else {
        console.error('Max reconnect attempts reached');
      }
    };
  }, [enabled, userId, onTasksUpdate, onWatcherUpdate, onConnect, onDisconnect]);

  // Keep ref updated for self-reference in reconnect
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnectionState('disconnected');
    onDisconnect?.();
  }, [onDisconnect]);

  useEffect(() => {
    // Only connect in browser environment
    if (typeof window === 'undefined') return;
    
    // Use setTimeout to avoid synchronous setState in effect
    const timeoutId = setTimeout(() => {
      if (enabled) {
        connect();
      } else {
        disconnect();
      }
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: connectionState === 'connected',
    connectionState,
  };
}
