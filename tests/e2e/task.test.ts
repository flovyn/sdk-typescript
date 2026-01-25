/**
 * E2E tests for task functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  taskSchedulingWorkflow,
  multiTaskWorkflow,
  parallelTasksWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Task E2E Tests', () => {
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

  it('should execute task scheduling workflow', async () => {
    const handle = await env.startWorkflow(taskSchedulingWorkflow, {
      count: 5,
    });

    const result = await env.awaitCompletion(handle);

    // 1, 1+2=3, 3+3=6, 6+4=10, 10+5=15
    expect(result.results).toEqual([1, 3, 6, 10, 15]);
    expect(result.total).toBe(15);
  });

  it('should execute multiple tasks sequentially', async () => {
    const handle = await env.startWorkflow(multiTaskWorkflow, {
      count: 3,
    });

    const result = await env.awaitCompletion(handle);

    // 0+0=0, 1+1=2, 2+2=4
    expect(result.results).toEqual([0, 2, 4]);
    expect(result.total).toBe(6);
  });

  it('should execute parallel tasks workflow', async () => {
    const handle = await env.startWorkflow(parallelTasksWorkflow, {
      count: 5,
    });

    const result = await env.awaitCompletion(handle);

    // 0+0, 1+1, 2+2, 3+3, 4+4 = 0, 2, 4, 6, 8
    expect(result.results).toEqual([0, 2, 4, 6, 8]);
    expect(result.total).toBe(20);
  });
});
