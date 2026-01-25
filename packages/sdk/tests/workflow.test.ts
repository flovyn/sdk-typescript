import { describe, it, expect } from 'vitest';
import { workflow, type WorkflowConfig } from '../src/workflow';
import { Duration } from '../src/duration';
import type { WorkflowContext } from '../src/types';

describe('workflow()', () => {
  describe('basic workflow creation', () => {
    it('creates a workflow with required fields', () => {
      const wf = workflow({
        name: 'test-workflow',
        async run(_ctx: WorkflowContext, input: { value: number }) {
          return { result: input.value * 2 };
        },
      });

      expect(wf.name).toBe('test-workflow');
      expect(typeof wf.run).toBe('function');
    });

    it('creates a workflow with all optional fields', () => {
      const wf = workflow({
        name: 'full-workflow',
        description: 'A fully configured workflow',
        version: '1.0.0',
        timeout: Duration.minutes(30),
        async run(_ctx: WorkflowContext, input: { x: number }) {
          return { y: input.x };
        },
        handlers: {
          signals: {
            cancel: (_ctx) => {},
          },
          queries: {
            status: (_ctx) => 'running',
          },
        },
      });

      expect(wf.name).toBe('full-workflow');
      expect(wf.description).toBe('A fully configured workflow');
      expect(wf.version).toBe('1.0.0');
      expect(wf.timeout?.toMinutes()).toBe(30);
      expect(wf.handlers?.signals?.cancel).toBeDefined();
      expect(wf.handlers?.queries?.status).toBeDefined();
    });
  });

  describe('validation', () => {
    it('throws when name is missing', () => {
      expect(() => {
        workflow({
          name: '',
          run: async () => {},
        });
      }).toThrow('Workflow name is required');
    });

    it('throws when run function is missing', () => {
      expect(() => {
        workflow({
          name: 'no-run',
          run: undefined as unknown as WorkflowConfig['run'],
        });
      }).toThrow('Workflow run function is required');
    });
  });

  describe('type inference', () => {
    it('infers input and output types', async () => {
      interface Input {
        userId: string;
        amount: number;
      }

      interface Output {
        success: boolean;
        transactionId: string;
      }

      const wf = workflow<Input, Output>({
        name: 'typed-workflow',
        async run(_ctx, input) {
          // TypeScript should infer input type
          const { userId, amount } = input;
          return {
            success: true,
            transactionId: `tx-${userId}-${amount}`,
          };
        },
      });

      expect(wf.name).toBe('typed-workflow');
    });
  });
});
