'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

// External store for socket connection status
let listeners: Array<() => void> = [];
let isConnected = false;

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return isConnected;
}

function getServerSnapshot() {
  return false;
}

// Initialize socket event listeners once
let initialized = false;
function ensureSocketListeners() {
  if (initialized) return;
  initialized = true;
  const s = getSocket();
  s.on('connect', () => {
    isConnected = true;
    listeners.forEach((l) => l());
  });
  s.on('disconnect', () => {
    isConnected = false;
    listeners.forEach((l) => l());
  });
}

export function useSocket() {
  ensureSocketListeners();
  const connected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) {
      s.connect();
    }
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    const s = getSocket();
    s.on(event, handler);
    return () => { s.off(event, handler); };
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    const s = getSocket();
    s.emit(event, data);
  }, []);

  return { connected, on, emit };
}

export function useTaskUpdates(callback: (data: { taskId: string; userId: string }) => void) {
  const { on } = useSocket();

  useEffect(() => {
    return on('tasks:updated', callback as (...args: unknown[]) => void);
  }, [on, callback]);
}

export function useProjectUpdates(callback: (data: { projectId: string; userId: string }) => void) {
  const { on } = useSocket();

  useEffect(() => {
    return on('project:updated', callback as (...args: unknown[]) => void);
  }, [on, callback]);
}

export interface TaskLogEvent {
  runId: string;
  taskId: string;
  stream: string;
  content: string;
  timestamp: string;
}

export function useNotifications(callback: (data: { type: string; title: string; message: string }) => void) {
  const { on } = useSocket();

  useEffect(() => {
    return on('notification:new', callback as (...args: unknown[]) => void);
  }, [on, callback]);
}

export function useUserSubscribe(userId: string | null) {
  const { connected, emit } = useSocket();

  useEffect(() => {
    if (!userId || !connected) return;
    emit('user:subscribe', { userId });
  }, [userId, connected, emit]);
}

export function useTaskLogs(taskId: string | null, callback: (log: TaskLogEvent) => void) {
  const { connected, on, emit } = useSocket();

  useEffect(() => {
    if (!taskId || !connected) return;

    emit('subscribe:task-logs', { taskId });

    const cleanup = on(`task:log:${taskId}`, callback as (...args: unknown[]) => void);

    return () => {
      emit('unsubscribe:task-logs', { taskId });
      cleanup();
    };
  }, [taskId, connected, on, emit, callback]);
}
