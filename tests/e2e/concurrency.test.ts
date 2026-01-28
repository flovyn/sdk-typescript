/**
 * E2E tests for concurrent execution patterns.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  doublerWorkflow,
  echoWorkflow,
  sleepWorkflow,
  fanOutFanInWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Concurrency E2E Tests', () => {
  let env: FlovynTestEnvironment;

  beforeAll(async () => {
    env = new FlovynTestEnvironment();

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

  it('should execute multiple workflows concurrently', async () => {
    /**
     * Test multiple workflows executing concurrently.
     *
     * This tests that the worker can handle multiple workflows being:
     * 1. Started concurrently
     * 2. Executed in parallel
     * 3. Completed independently with correct results
     */
    const numWorkflows = 5;

    // Start multiple workflows concurrently
    const handles: Array<{ inputValue: number; handle: Awaited<ReturnType<typeof env.startWorkflow>> }> = [];
    for (let i = 0; i < numWorkflows; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, {
        value: i * 10,
      });
      handles.push({ inputValue: i * 10, handle });
    }

    // Wait for all workflows to complete
    const results: Array<{ inputValue: number; outputValue: number }> = [];
    for (const { inputValue, handle } of handles) {
      const result = await env.awaitCompletion(handle, Duration.seconds(30));
      results.push({ inputValue, outputValue: result.result });
    }

    // Verify all results are correct
    expect(results).toHaveLength(numWorkflows);
    for (const { inputValue, outputValue } of results) {
      const expected = inputValue * 2;
      expect(outputValue).toBe(expected);
    }
  });

  it('should execute tasks concurrently within workflows', async () => {
    /**
     * Test multiple tasks executing concurrently within workflows.
     *
     * This tests that tasks are executed in parallel correctly when
     * scheduled at the same time.
     */
    // Schedule 3 workflows, each with parallel tasks
    const handles: Array<{ index: number; items: string[]; handle: Awaited<ReturnType<typeof env.startWorkflow>> }> = [];
    for (let i = 0; i < 3; i++) {
      const items = [`item-${i}-0`, `item-${i}-1`, `item-${i}-2`, `item-${i}-3`];
      const { handle } = await env.startWorkflow(fanOutFanInWorkflow, { items });
      handles.push({ index: i, items, handle });
    }

    // Wait for all workflows
    for (const { items, handle } of handles) {
      const result = await env.awaitCompletion(handle, Duration.seconds(30));
      expect(result.inputCount).toBe(items.length);
      expect(result.outputCount).toBe(items.length);
      expect(new Set(result.processedItems)).toEqual(new Set(items));
    }
  });

  it('should handle high throughput with small workflows', async () => {
    /**
     * Test high throughput with many small workflows.
     *
     * Starts many simple workflows quickly to test throughput.
     */
    const numWorkflows = 20;

    // Start all workflows as fast as possible
    const handles: Array<{ index: number; handle: Awaited<ReturnType<typeof env.startWorkflow>> }> = [];
    for (let i = 0; i < numWorkflows; i++) {
      const { handle } = await env.startWorkflow(echoWorkflow, {
        message: `msg-${i}`,
      });
      handles.push({ index: i, handle });
    }

    // Wait for all to complete
    let completedCount = 0;
    for (const { index, handle } of handles) {
      const result = await env.awaitCompletion(handle, Duration.seconds(60));
      expect(result.message).toBe(`msg-${index}`);
      completedCount++;
    }

    expect(completedCount).toBe(numWorkflows);
  });

  it('should handle mixed workflow types concurrently', async () => {
    /**
     * Test concurrent execution of different workflow types.
     *
     * Verifies that different workflow types can run concurrently
     * without interfering with each other.
     */
    const handles: Array<{
      type: 'echo' | 'doubler' | 'sleep';
      index: number;
      handle: Awaited<ReturnType<typeof env.startWorkflow>>;
    }> = [];

    // Echo workflows
    for (let i = 0; i < 3; i++) {
      const { handle } = await env.startWorkflow(echoWorkflow, {
        message: `echo-${i}`,
      });
      handles.push({ type: 'echo', index: i, handle });
    }

    // Doubler workflows
    for (let i = 0; i < 3; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, {
        value: i * 5,
      });
      handles.push({ type: 'doubler', index: i, handle });
    }

    // Sleep workflows (short sleeps)
    for (let i = 0; i < 2; i++) {
      const { handle } = await env.startWorkflow(sleepWorkflow, {
        durationMs: 50,
      });
      handles.push({ type: 'sleep', index: i, handle });
    }

    // Wait for all and verify
    for (const { type, index, handle } of handles) {
      if (type === 'echo') {
        const result = await env.awaitCompletion(handle, Duration.seconds(30));
        expect(result.message).toBe(`echo-${index}`);
      } else if (type === 'doubler') {
        const result = await env.awaitCompletion(handle, Duration.seconds(30));
        expect(result.result).toBe(index * 5 * 2);
      } else if (type === 'sleep') {
        const result = await env.awaitCompletion(handle, Duration.seconds(30));
        expect(result.sleptDurationMs).toBe(50);
      }
    }
  });
});
