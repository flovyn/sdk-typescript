import { describe, it, expect } from 'vitest';
import { task, type TaskConfig } from '../src/task';
import { Duration } from '../src/duration';
import type { TaskContext } from '../src/types';

describe('task()', () => {
  describe('basic task creation', () => {
    it('creates a task with required fields', () => {
      const t = task({
        name: 'test-task',
        async run(_ctx: TaskContext, input: { value: number }) {
          return { result: input.value * 2 };
        },
      });

      expect(t.name).toBe('test-task');
      expect(typeof t.run).toBe('function');
    });

    it('creates a task with all optional fields', () => {
      const t = task({
        name: 'full-task',
        description: 'A fully configured task',
        timeout: Duration.minutes(5),
        retry: {
          maxRetries: 3,
          initialDelay: Duration.seconds(1),
          maxDelay: Duration.seconds(30),
          backoffMultiplier: 2,
        },
        async run(_ctx: TaskContext, input: { x: number }) {
          return { y: input.x };
        },
        hooks: {
          onStart: async () => {},
          onSuccess: async () => {},
          onFailure: async () => {},
        },
      });

      expect(t.name).toBe('full-task');
      expect(t.description).toBe('A fully configured task');
      expect(t.timeout?.toMinutes()).toBe(5);
      expect(t.retry?.maxRetries).toBe(3);
      expect(t.hooks?.onStart).toBeDefined();
      expect(t.hooks?.onSuccess).toBeDefined();
      expect(t.hooks?.onFailure).toBeDefined();
    });
  });

  describe('validation', () => {
    it('throws when name is missing', () => {
      expect(() => {
        task({
          name: '',
          run: async () => {},
        });
      }).toThrow('Task name is required');
    });

    it('throws when run function is missing', () => {
      expect(() => {
        task({
          name: 'no-run',
          run: undefined as unknown as TaskConfig['run'],
        });
      }).toThrow('Task run function is required');
    });
  });

  describe('type inference', () => {
    it('infers input and output types', async () => {
      interface Input {
        to: string;
        subject: string;
        body: string;
      }

      interface Output {
        messageId: string;
        sent: boolean;
      }

      const t = task<Input, Output>({
        name: 'send-email',
        async run(_ctx, input) {
          // TypeScript should infer input type
          const { to, subject } = input;
          return {
            messageId: `msg-${to}-${subject.slice(0, 5)}`,
            sent: true,
          };
        },
      });

      expect(t.name).toBe('send-email');
    });
  });

  describe('retry policy', () => {
    it('stores retry configuration', () => {
      const t = task({
        name: 'retryable-task',
        retry: {
          maxRetries: 5,
          initialDelay: Duration.seconds(2),
          backoffMultiplier: 1.5,
        },
        async run() {
          return {};
        },
      });

      expect(t.retry?.maxRetries).toBe(5);
      expect(t.retry?.initialDelay?.toSeconds()).toBe(2);
      expect(t.retry?.backoffMultiplier).toBe(1.5);
    });
  });
});
