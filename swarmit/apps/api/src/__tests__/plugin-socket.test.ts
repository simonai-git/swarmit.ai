import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Track the connection handler and socket event handlers
let connectionHandler: ((socket: any) => void) | undefined;
const mockSocketOn = vi.fn();
const mockIoClose = vi.fn();
const mockIoAdapter = vi.fn();
const mockEmit = vi.fn();
const mockIoTo = vi.fn().mockReturnValue({ emit: mockEmit });
const mockIoEmit = vi.fn();

const mockIoOn = vi.fn().mockImplementation((event: string, handler: any) => {
  if (event === 'connection') {
    connectionHandler = handler;
  }
});

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    on: mockIoOn,
    adapter: mockIoAdapter,
    close: mockIoClose,
    to: mockIoTo,
    emit: mockIoEmit,
  })),
}));

const mockSubscribe = vi.fn();
const mockRedisOn = vi.fn();
const mockDuplicate = vi.fn().mockReturnValue({});

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    duplicate: mockDuplicate,
    subscribe: mockSubscribe,
    on: mockRedisOn,
  })),
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn().mockReturnValue('mock-adapter'),
}));

vi.mock('@swarmit/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { socketPlugin } from '../plugins/socket.js';
import { Server } from 'socket.io';
import { Redis } from 'ioredis';

describe('socketPlugin', () => {
  let app: FastifyInstance;
  const originalEnv = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionHandler = undefined;
    delete process.env.REDIS_URL;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (originalEnv !== undefined) {
      process.env.REDIS_URL = originalEnv;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it('decorates the app with io', async () => {
    app = Fastify({ logger: false });
    await app.register(socketPlugin);
    await app.ready();

    expect(app.io).toBeDefined();
  });

  it('creates a socket.io Server instance', async () => {
    app = Fastify({ logger: false });
    await app.register(socketPlugin);
    await app.ready();

    expect(Server).toHaveBeenCalledOnce();
    expect(Server).toHaveBeenCalledWith(
      app.server,
      expect.objectContaining({
        cors: expect.objectContaining({ credentials: true }),
        path: '/socket.io',
      })
    );
  });

  it('registers a connection event listener', async () => {
    app = Fastify({ logger: false });
    await app.register(socketPlugin);
    await app.ready();

    expect(mockIoOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('handles task:subscribe by joining the correct room', async () => {
    app = Fastify({ logger: false });
    await app.register(socketPlugin);
    await app.ready();

    expect(connectionHandler).toBeDefined();

    const mockJoin = vi.fn();
    const mockLeave = vi.fn();
    const socketHandlers: Record<string, Function> = {};
    const mockSocket = {
      id: 'socket-1',
      join: mockJoin,
      leave: mockLeave,
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        socketHandlers[event] = handler;
      }),
    };

    connectionHandler!(mockSocket);

    // Verify socket event listeners were registered
    expect(mockSocket.on).toHaveBeenCalledWith('task:subscribe', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('task:unsubscribe', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('project:subscribe', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('project:unsubscribe', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('user:subscribe', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));

    // Test task:subscribe
    socketHandlers['task:subscribe']({ taskId: 'task-123' });
    expect(mockJoin).toHaveBeenCalledWith('task:task-123');

    // Test task:unsubscribe
    socketHandlers['task:unsubscribe']({ taskId: 'task-123' });
    expect(mockLeave).toHaveBeenCalledWith('task:task-123');

    // Test project:subscribe
    socketHandlers['project:subscribe']({ projectId: 'project-456' });
    expect(mockJoin).toHaveBeenCalledWith('project:project-456');

    // Test project:unsubscribe
    socketHandlers['project:unsubscribe']({ projectId: 'project-456' });
    expect(mockLeave).toHaveBeenCalledWith('project:project-456');

    // Test user:subscribe
    socketHandlers['user:subscribe']({ userId: 'user-789' });
    expect(mockJoin).toHaveBeenCalledWith('user:user-789');
  });

  it('closes io on app close', async () => {
    app = Fastify({ logger: false });
    await app.register(socketPlugin);
    await app.ready();

    await app.close();
    expect(mockIoClose).toHaveBeenCalledOnce();

    // Prevent afterEach from closing again
    app = undefined as any;
  });

  describe('with REDIS_URL set', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('sets up Redis adapter', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      // Should create Redis clients for pub/sub adapter
      expect(Redis).toHaveBeenCalled();
      expect(mockDuplicate).toHaveBeenCalled();
      expect(mockIoAdapter).toHaveBeenCalledWith('mock-adapter');
    });

    it('subscribes to Redis channels for worker events', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      expect(mockSubscribe).toHaveBeenCalledWith(
        'task-logs',
        'task-updates',
        'project-updates',
        'notifications'
      );
    });

    it('handles Redis messages for task-logs channel', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      // Find the 'message' handler on the subscriber Redis instance
      const messageCall = mockRedisOn.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      expect(messageCall).toBeDefined();

      const messageHandler = messageCall![1];

      // Test task-logs channel
      const taskLogData = { taskId: 'task-1', message: 'log message' };
      messageHandler('task-logs', JSON.stringify(taskLogData));
      expect(mockIoTo).toHaveBeenCalledWith('task:task-1');
      expect(mockEmit).toHaveBeenCalledWith('task:log', taskLogData);
    });

    it('handles Redis messages for task-updates channel', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      const messageCall = mockRedisOn.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      const messageHandler = messageCall![1];

      const updateData = { taskId: 'task-1', status: 'completed' };
      messageHandler('task-updates', JSON.stringify(updateData));
      expect(mockIoEmit).toHaveBeenCalledWith('tasks:updated', updateData);
    });

    it('handles Redis messages for project-updates channel', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      const messageCall = mockRedisOn.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      const messageHandler = messageCall![1];

      const updateData = { projectId: 'project-1', status: 'active' };
      messageHandler('project-updates', JSON.stringify(updateData));
      expect(mockIoEmit).toHaveBeenCalledWith('project:updated', updateData);
    });

    it('handles Redis messages for notifications channel with userId', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      const messageCall = mockRedisOn.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      const messageHandler = messageCall![1];

      vi.clearAllMocks();
      const notifData = { userId: 'user-1', message: 'hello' };
      messageHandler('notifications', JSON.stringify(notifData));
      expect(mockIoTo).toHaveBeenCalledWith('user:user-1');
      expect(mockEmit).toHaveBeenCalledWith('notification:new', notifData);
    });

    it('handles invalid JSON in Redis messages gracefully', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      const messageCall = mockRedisOn.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      );
      const messageHandler = messageCall![1];

      // Should not throw
      expect(() => messageHandler('task-logs', 'not-valid-json')).not.toThrow();
    });
  });

  describe('without REDIS_URL', () => {
    it('does not set up Redis adapter', async () => {
      app = Fastify({ logger: false });
      await app.register(socketPlugin);
      await app.ready();

      // Redis should not be created (no REDIS_URL)
      expect(Redis).not.toHaveBeenCalled();
      expect(mockIoAdapter).not.toHaveBeenCalled();
    });
  });
});
