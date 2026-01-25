/**
 * E2E tests for parallel execution patterns.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  fanOutFanInWorkflow,
  largeBatchWorkflow,
  mixedParallelWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Parallel E2E Tests', () => {
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

  it('should handle fan-out/fan-in pattern', async () => {
    /**
     * Test fan-out/fan-in pattern with parallel tasks.
     *
     * Flow:
     * 1. Schedule multiple tasks in parallel (fan-out)
     * 2. Collect all results (fan-in)
     * 3. Aggregate results
     */
    const items = ['apple', 'banana', 'cherry', 'date'];

    const handle = await env.startWorkflow(fanOutFanInWorkflow, {
      items,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.inputCount).toBe(4);
    expect(result.outputCount).toBe(4);
    // All items should be echoed back
    expect(new Set(result.processedItems)).toEqual(new Set(items));
    // Total length should be sum of all item lengths
    expect(result.totalLength).toBe(items.reduce((sum, item) => sum + item.length, 0));
  });

  it('should handle parallel large batch', async () => {
    /**
     * Test parallel execution with many tasks.
     *
     * Schedules 20 tasks in parallel and verifies all complete correctly.
     */
    const handle = await env.startWorkflow(largeBatchWorkflow, {
      count: 20,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(60));

    expect(result.taskCount).toBe(20);
    // Each task computes i + 1 for i in range(20)
    // So results are [1, 2, 3, ..., 20]
    // Total = sum(1..20) = 20 * 21 / 2 = 210
    expect(result.total).toBe(210);
    expect(result.minValue).toBe(1);
    expect(result.maxValue).toBe(20);
  });

  it('should handle empty parallel batch', async () => {
    /**
     * Test handling of empty parallel batch.
     *
     * Verifies workflow handles zero items gracefully.
     */
    const handle = await env.startWorkflow(fanOutFanInWorkflow, {
      items: [],
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.inputCount).toBe(0);
    expect(result.outputCount).toBe(0);
    expect(result.processedItems).toEqual([]);
    expect(result.totalLength).toBe(0);
  });

  it('should handle parallel single item', async () => {
    /**
     * Test parallel pattern with single item.
     *
     * Verifies edge case of batch size 1.
     */
    const handle = await env.startWorkflow(fanOutFanInWorkflow, {
      items: ['only-one'],
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.inputCount).toBe(1);
    expect(result.outputCount).toBe(1);
    expect(result.processedItems).toEqual(['only-one']);
    expect(result.totalLength).toBe(8); // len("only-one")
  });

  it('should handle parallel tasks with join_all pattern', async () => {
    /**
     * Test basic parallel task scheduling with join_all pattern.
     *
     * Schedules multiple tasks and awaits all results.
     */
    const items = ['a', 'b', 'c'];

    const handle = await env.startWorkflow(fanOutFanInWorkflow, {
      items,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.inputCount).toBe(3);
    expect(result.outputCount).toBe(3);
    // Verify all items were processed
    expect(new Set(result.processedItems)).toEqual(new Set(items));
  });

  it('should handle mixed parallel operations with tasks and timers', async () => {
    /**
     * Test mixed parallel operations with tasks and timers.
     *
     * This workflow:
     * 1. Phase 1: Two parallel echo tasks
     * 2. Timer: Wait for 100ms
     * 3. Phase 3: Three parallel add tasks
     */
    const handle = await env.startWorkflow(mixedParallelWorkflow, {});

    const result = await env.awaitCompletion(handle, Duration.seconds(60));

    expect(result.success).toBe(true);
    expect(result.phase1Results).toHaveLength(2);
    expect(result.timerFired).toBe(true);
    expect(result.phase3Results).toHaveLength(3);
    // Phase 3 computes i + i for i in [0, 1, 2] = [0, 2, 4]
    expect(result.phase3Results).toEqual([0, 2, 4]);
  });
});
