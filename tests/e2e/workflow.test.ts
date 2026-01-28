/**
 * E2E tests for workflow functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  echoWorkflow,
  doublerWorkflow,
  failingWorkflow,
  statefulWorkflow,
  runOperationWorkflow,
  randomWorkflow,
  sleepWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Workflow E2E Tests', () => {
  let env: FlovynTestEnvironment;

  beforeAll(async () => {
    env = new FlovynTestEnvironment();

    // Register all workflows and tasks
    for (const workflow of allWorkflows) {
      env.registerWorkflow(workflow);
    }
    for (const task of allTasks) {
      env.registerTask(task);
    }

    await env.start();
  }, 60000);

  afterAll(async () => {
    await env.stop();
  });

  it('should execute echo workflow', async () => {
    const { handle } = await env.startWorkflow(echoWorkflow, {
      message: 'Hello, World!',
    });

    const result = await env.awaitCompletion(handle);

    expect(result.message).toBe('Hello, World!');
    expect(result.timestamp).toBeDefined();
  });

  it('should execute doubler workflow', async () => {
    const { handle } = await env.startWorkflow(doublerWorkflow, {
      value: 21,
    });

    const result = await env.awaitCompletion(handle);

    expect(result.result).toBe(42);
  });

  it('should handle failing workflow', async () => {
    const { handle } = await env.startWorkflow(failingWorkflow, {
      errorMessage: 'Intentional test failure',
    });

    await expect(env.awaitCompletion(handle)).rejects.toThrow('Intentional test failure');
  });

  it('should handle stateful workflow', async () => {
    const { handle } = await env.startWorkflow(statefulWorkflow, {
      key: 'test-key',
      value: 'test-value',
    });

    const result = await env.awaitCompletion(handle);

    expect(result.storedValue).toBe('test-value');
    expect(result.allKeys).toContain('test-key');
  });

  it('should handle run operation workflow', async () => {
    const { handle } = await env.startWorkflow(runOperationWorkflow, {
      operationName: 'my-operation',
    });

    const result = await env.awaitCompletion(handle);

    expect(result.result).toBe('executed-my-operation');
  });

  it('should generate deterministic random values', async () => {
    const { handle } = await env.startWorkflow(randomWorkflow, {});

    const result = await env.awaitCompletion(handle);

    // Verify we got values (determinism is verified by successful replay)
    expect(result.uuid).toBeDefined();
    expect(result.uuid.length).toBe(36); // UUID format
    expect(result.randomFloat).toBeGreaterThanOrEqual(0);
    expect(result.randomFloat).toBeLessThan(1);
  });

  it('should handle durable timers', async () => {
    const { handle } = await env.startWorkflow(sleepWorkflow, {
      durationMs: 100, // 100ms sleep
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.sleptDurationMs).toBe(100);
    expect(result.startTime).toBeDefined();
    expect(result.endTime).toBeDefined();
  });

  it('should execute multiple workflows in parallel', async () => {
    // Start 5 workflows concurrently
    const handles: Array<{ input: number; handle: Awaited<ReturnType<typeof env.startWorkflow>> }> = [];
    for (let i = 0; i < 5; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, { value: i });
      handles.push({ input: i, handle });
    }

    // Await all results
    for (const { input, handle } of handles) {
      const result = await env.awaitCompletion(handle);
      expect(result.result).toBe(input * 2);
    }
  });
});
