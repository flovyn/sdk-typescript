/**
 * E2E tests for replay and determinism functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  mixedCommandsWorkflow,
  taskSchedulingWorkflow,
  parallelTasksWorkflow,
  sleepWorkflow,
  childLoopWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Replay E2E Tests', () => {
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

  it('should replay mixed commands workflow correctly', async () => {
    /**
     * Test workflow with mixed command types (operations, timers, tasks).
     *
     * This validates per-type sequence matching during replay:
     * 1. Operation (ctx.run)
     * 2. Timer (ctx.sleep)
     * 3. Task (ctx.execute_task)
     * 4. Another operation
     *
     * The workflow will be replayed multiple times as each async operation
     * completes, and must produce consistent results.
     */
    const handle = await env.startWorkflow(mixedCommandsWorkflow, {
      value: 42,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify all steps completed correctly
    expect(result.operationResult).toBe('computed-42');
    expect(result.sleepCompleted).toBe(true);
    expect(result.taskResult).toBe(52); // 42 + 10
    expect(result.finalValue).toBe(84); // 42 * 2
  });

  it('should replay sequential tasks in loop correctly', async () => {
    /**
     * Test that tasks scheduled in a loop replay correctly.
     *
     * This is an implicit replay test - the workflow schedules multiple
     * tasks sequentially. Each time a task completes, the workflow is
     * replayed and must produce the same task schedule sequence.
     */
    const handle = await env.startWorkflow(taskSchedulingWorkflow, {
      count: 5,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Each task adds 1, 2, 3, 4, 5 to running total
    // Results: [1, 3, 6, 10, 15]
    expect(result.results).toEqual([1, 3, 6, 10, 15]);
    expect(result.total).toBe(15);
  });

  it('should replay parallel tasks correctly', async () => {
    /**
     * Test that parallel tasks scheduled together replay correctly.
     *
     * When multiple tasks are scheduled in parallel, replay must
     * correctly match each task to its result event.
     */
    const handle = await env.startWorkflow(parallelTasksWorkflow, {
      count: 5,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Each task computes i + i: [0, 2, 4, 6, 8]
    expect(result.results).toEqual([0, 2, 4, 6, 8]);
    expect(result.total).toBe(20);
  });

  it('should replay timer events correctly', async () => {
    /**
     * Test that timer events replay correctly.
     *
     * A workflow with sleep should replay correctly, using the
     * stored timer duration from the event history.
     */
    const handle = await env.startWorkflow(sleepWorkflow, {
      durationMs: 100,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.sleptDurationMs).toBe(100);
    // Verify timestamps are present
    expect(result.startTime).toBeDefined();
    expect(result.endTime).toBeDefined();
  });

  it('should replay child workflows in loop correctly', async () => {
    /**
     * Test that child workflows scheduled in a loop replay correctly.
     *
     * This tests per-type sequence matching for child workflows during replay.
     * Each iteration schedules a child workflow, and on replay, the correct
     * child workflow result must be matched to each iteration.
     */
    const handle = await env.startWorkflow(childLoopWorkflow, {
      count: 3,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(60));

    expect(result.totalCount).toBe(3);
    expect(result.results).toEqual(['child-0', 'child-1', 'child-2']);
  });
});
