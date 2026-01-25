import { describe, it, expect, vi } from 'vitest';
import { TaskContextImpl, type StreamEvent } from '../src/context/task-context';
import type { TaskActivationData } from '@flovyn/native';
import { TaskCancelled } from '../src/errors';

describe('TaskContextImpl', () => {
  const createActivation = (overrides?: Partial<TaskActivationData>): TaskActivationData => ({
    taskExecutionId: 'task-123',
    taskKind: 'test-task',
    input: '{"value": 42}',
    attempt: 1,
    maxRetries: 3,
    ...overrides,
  });

  describe('basic properties', () => {
    it('exposes task execution ID', () => {
      const ctx = new TaskContextImpl(createActivation());
      expect(ctx.taskExecutionId).toBe('task-123');
    });

    it('exposes task kind', () => {
      const ctx = new TaskContextImpl(createActivation());
      expect(ctx.taskKind).toBe('test-task');
    });

    it('exposes attempt number', () => {
      const ctx = new TaskContextImpl(createActivation({ attempt: 2 }));
      expect(ctx.attempt).toBe(2);
    });

    it('provides a logger', () => {
      const ctx = new TaskContextImpl(createActivation());
      expect(ctx.log).toBeDefined();
      expect(typeof ctx.log.info).toBe('function');
      expect(typeof ctx.log.debug).toBe('function');
      expect(typeof ctx.log.warn).toBe('function');
      expect(typeof ctx.log.error).toBe('function');
    });
  });

  describe('progress reporting', () => {
    it('reports progress', () => {
      const onProgress = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), onProgress);

      ctx.reportProgress(0.5);

      expect(onProgress).toHaveBeenCalledWith(0.5);
      expect(ctx.progress).toBe(0.5);
    });

    it('validates progress range', () => {
      const ctx = new TaskContextImpl(createActivation());

      expect(() => ctx.reportProgress(-0.1)).toThrow('Progress must be between 0 and 1');
      expect(() => ctx.reportProgress(1.1)).toThrow('Progress must be between 0 and 1');
    });

    it('accepts edge values', () => {
      const ctx = new TaskContextImpl(createActivation());

      ctx.reportProgress(0);
      expect(ctx.progress).toBe(0);

      ctx.reportProgress(1);
      expect(ctx.progress).toBe(1);
    });
  });

  describe('heartbeat', () => {
    it('sends heartbeat', () => {
      const onHeartbeat = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), undefined, onHeartbeat);

      const before = ctx.lastHeartbeat;
      ctx.heartbeat();

      expect(onHeartbeat).toHaveBeenCalled();
      expect(ctx.lastHeartbeat).toBeGreaterThanOrEqual(before);
    });
  });

  describe('cancellation', () => {
    it('starts not cancelled', () => {
      const ctx = new TaskContextImpl(createActivation());
      expect(ctx.isCancelled).toBe(false);
    });

    it('can be marked as cancelled', () => {
      const ctx = new TaskContextImpl(createActivation());
      ctx._markCancelled();
      expect(ctx.isCancelled).toBe(true);
    });

    it('checkCancellation throws when cancelled', () => {
      const ctx = new TaskContextImpl(createActivation());
      ctx._markCancelled();

      expect(() => ctx.checkCancellation()).toThrow(TaskCancelled);
    });

    it('checkCancellation does nothing when not cancelled', () => {
      const ctx = new TaskContextImpl(createActivation());
      expect(() => ctx.checkCancellation()).not.toThrow();
    });

    it('creates cancellation error with task ID', () => {
      const ctx = new TaskContextImpl(createActivation());
      const error = ctx.cancellationError();

      expect(error).toBeInstanceOf(TaskCancelled);
      expect((error as TaskCancelled).taskExecutionId).toBe('task-123');
    });
  });

  describe('streaming', () => {
    it('streams tokens', () => {
      const onStream = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), undefined, undefined, onStream);

      ctx.streamToken('Hello');

      expect(onStream).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'token',
          data: 'Hello',
        })
      );
      expect(ctx.streamEvents).toHaveLength(1);
    });

    it('streams progress updates', () => {
      const onStream = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), undefined, undefined, onStream);

      ctx.streamProgress(0.75);

      expect(onStream).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          data: 0.75,
        })
      );
    });

    it('streams arbitrary data', () => {
      const onStream = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), undefined, undefined, onStream);

      ctx.streamData({ custom: 'data' });

      expect(onStream).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'data',
          data: { custom: 'data' },
        })
      );
    });

    it('streams errors', () => {
      const onStream = vi.fn();
      const ctx = new TaskContextImpl(createActivation(), undefined, undefined, onStream);

      ctx.streamError('Something went wrong');

      expect(onStream).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          data: 'Something went wrong',
        })
      );
    });

    it('collects all stream events', () => {
      const ctx = new TaskContextImpl(createActivation());

      ctx.streamToken('A');
      ctx.streamProgress(0.5);
      ctx.streamData({ x: 1 });
      ctx.streamError('oops');

      expect(ctx.streamEvents).toHaveLength(4);
      expect(ctx.streamEvents[0].type).toBe('token');
      expect(ctx.streamEvents[1].type).toBe('progress');
      expect(ctx.streamEvents[2].type).toBe('data');
      expect(ctx.streamEvents[3].type).toBe('error');
    });

    it('includes timestamps in stream events', () => {
      const ctx = new TaskContextImpl(createActivation());
      const before = Date.now();

      ctx.streamToken('test');

      const event = ctx.streamEvents[0];
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });
});
