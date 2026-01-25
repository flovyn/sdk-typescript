/**
 * Unit tests for FlovynClient registration and configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflow } from '../src/workflow';
import { task } from '../src/task';
import type { WorkflowContext, TaskContext } from '../src/types';

// Mock the native module
vi.mock('@flovyn/native', () => ({
  NapiClient: vi.fn().mockImplementation(() => ({
    startWorkflow: vi.fn().mockResolvedValue({ workflowExecutionId: 'test-wf-id' }),
    resolvePromise: vi.fn().mockResolvedValue(undefined),
    rejectPromise: vi.fn().mockResolvedValue(undefined),
  })),
  NapiWorker: vi.fn().mockImplementation(() => ({
    register: vi.fn().mockResolvedValue(undefined),
    pollWorkflowActivation: vi.fn().mockResolvedValue(null),
    pollTaskActivation: vi.fn().mockResolvedValue(null),
    completeWorkflowActivation: vi.fn().mockResolvedValue(undefined),
    completeTask: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mock setup
import { FlovynClient } from '../src/client';

describe('FlovynClient', () => {
  // Sample workflows and tasks for testing
  const testWorkflow = workflow({
    name: 'test-workflow',
    description: 'A test workflow',
    version: '1.0.0',
    async run(_ctx: WorkflowContext, input: { value: number }) {
      return { result: input.value * 2 };
    },
  });

  const anotherWorkflow = workflow({
    name: 'another-workflow',
    async run(_ctx: WorkflowContext) {
      return { done: true };
    },
  });

  const testTask = task({
    name: 'test-task',
    description: 'A test task',
    async run(_ctx: TaskContext, input: { x: number }) {
      return { y: input.x + 1 };
    },
  });

  const anotherTask = task({
    name: 'another-task',
    async run(_ctx: TaskContext) {
      return 'completed';
    },
  });

  let client: FlovynClient;

  beforeEach(() => {
    client = new FlovynClient({
      serverUrl: 'http://localhost:9090',
      orgId: 'test-org',
      queue: 'test-queue',
    });
  });

  afterEach(async () => {
    if (client.isStarted()) {
      await client.stop();
    }
  });

  describe('constructor', () => {
    it('creates client with required options', () => {
      const c = new FlovynClient({
        serverUrl: 'http://localhost:9090',
        orgId: 'my-org',
      });

      expect(c.isStarted()).toBe(false);
    });

    it('creates client with all options', () => {
      const c = new FlovynClient({
        serverUrl: 'http://localhost:9090',
        orgId: 'my-org',
        queue: 'custom-queue',
        workerToken: 'test-token',
        apiKey: 'api-key',
        httpUrl: 'http://localhost:8080',
        orgSlug: 'my-org-slug',
      });

      expect(c.isStarted()).toBe(false);
    });

    it('uses default queue when not specified', async () => {
      const c = new FlovynClient({
        serverUrl: 'http://localhost:9090',
        orgId: 'my-org',
      });

      c.registerWorkflow(testWorkflow);
      // Client should not throw when using default queue
      expect(c.isStarted()).toBe(false);
    });
  });

  describe('registerWorkflow', () => {
    it('registers a workflow', () => {
      client.registerWorkflow(testWorkflow);
      // No error thrown means success
    });

    it('registers multiple workflows', () => {
      client.registerWorkflow(testWorkflow);
      client.registerWorkflow(anotherWorkflow);
      // No error thrown means success
    });

    it('throws when registering duplicate workflow', () => {
      client.registerWorkflow(testWorkflow);

      expect(() => {
        client.registerWorkflow(testWorkflow);
      }).toThrow('Workflow "test-workflow" is already registered');
    });

    it('throws when registering after client started', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      expect(() => {
        client.registerWorkflow(anotherWorkflow);
      }).toThrow('Cannot register workflows after client has started');
    });
  });

  describe('registerTask', () => {
    it('registers a task', () => {
      client.registerTask(testTask);
      // No error thrown means success
    });

    it('registers multiple tasks', () => {
      client.registerTask(testTask);
      client.registerTask(anotherTask);
      // No error thrown means success
    });

    it('throws when registering duplicate task', () => {
      client.registerTask(testTask);

      expect(() => {
        client.registerTask(testTask);
      }).toThrow('Task "test-task" is already registered');
    });

    it('throws when registering after client started', async () => {
      client.registerTask(testTask);
      await client.start();

      expect(() => {
        client.registerTask(anotherTask);
      }).toThrow('Cannot register tasks after client has started');
    });
  });

  describe('start/stop', () => {
    it('starts the client', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      expect(client.isStarted()).toBe(true);
    });

    it('throws when starting already started client', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      await expect(client.start()).rejects.toThrow('Client is already started');
    });

    it('stops the client', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();
      await client.stop();

      expect(client.isStarted()).toBe(false);
    });

    it('stop is idempotent (can be called multiple times)', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();
      await client.stop();
      await client.stop(); // Should not throw

      expect(client.isStarted()).toBe(false);
    });

    it('stop does nothing when not started', async () => {
      await client.stop(); // Should not throw
      expect(client.isStarted()).toBe(false);
    });
  });

  describe('startWorkflow', () => {
    it('throws when client is not started', async () => {
      await expect(client.startWorkflow(testWorkflow, { value: 42 })).rejects.toThrow(
        'Client is not started'
      );
    });

    it('starts a workflow and returns handle', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      const handle = await client.startWorkflow(testWorkflow, { value: 42 });

      expect(handle.workflowId).toBe('test-wf-id');
    });

    it('starts workflow with options', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      const handle = await client.startWorkflow(testWorkflow, { value: 42 }, {
        queue: 'custom-queue',
        workflowVersion: '2.0.0',
        idempotencyKey: 'unique-key-123',
      });

      expect(handle.workflowId).toBe('test-wf-id');
    });
  });

  describe('getWorkflowHandle', () => {
    it('throws when client is not started', () => {
      expect(() => client.getWorkflowHandle('some-id')).toThrow('Client is not started');
    });

    it('returns handle for existing workflow', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      const handle = client.getWorkflowHandle('existing-wf-id');

      expect(handle.workflowId).toBe('existing-wf-id');
    });
  });

  describe('resolvePromise', () => {
    it('throws when client is not started', async () => {
      await expect(client.resolvePromise('promise-id', { approved: true })).rejects.toThrow(
        'Client is not started'
      );
    });

    it('resolves a promise', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      await client.resolvePromise('promise-id', { approved: true });
      // No error thrown means success
    });
  });

  describe('rejectPromise', () => {
    it('throws when client is not started', async () => {
      await expect(client.rejectPromise('promise-id', 'error message')).rejects.toThrow(
        'Client is not started'
      );
    });

    it('rejects a promise', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      await client.rejectPromise('promise-id', 'error message');
      // No error thrown means success
    });
  });

  describe('status methods', () => {
    it('getActiveWorkflowExecutions returns 0 when not started', () => {
      expect(client.getActiveWorkflowExecutions()).toBe(0);
    });

    it('getActiveTaskExecutions returns 0 when not started', () => {
      expect(client.getActiveTaskExecutions()).toBe(0);
    });

    it('getActiveWorkflowExecutions returns count when started', async () => {
      client.registerWorkflow(testWorkflow);
      await client.start();

      expect(client.getActiveWorkflowExecutions()).toBe(0);
    });

    it('getActiveTaskExecutions returns count when started', async () => {
      client.registerTask(testTask);
      await client.start();

      expect(client.getActiveTaskExecutions()).toBe(0);
    });
  });
});
