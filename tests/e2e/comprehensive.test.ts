/**
 * E2E tests for comprehensive workflow functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  comprehensiveWorkflow,
  echoWorkflow,
  doublerWorkflow,
  randomWorkflow,
  sleepWorkflow,
  statefulWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Comprehensive E2E Tests', () => {
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

  it('should test comprehensive workflow features', async () => {
    /**
     * Test workflow that combines multiple features together.
     *
     * This comprehensive test verifies (matching Rust SDK):
     * - Basic workflow execution
     * - Input/output handling
     * - Operation recording (ctx.run)
     * - State set/get operations
     * - Multiple operations in sequence
     */
    const { handle } = await env.startWorkflow(comprehensiveWorkflow, {
      value: 21,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Validate all features tested by the comprehensive workflow
    expect(result.inputValue).toBe(21);
    expect(result.runResult).toBe(42); // ctx.run() should record operation
    expect(result.stateSet).toBe(true);
    expect(result.stateMatches).toBe(true); // State get should return what was set
    expect(result.tripleResult).toBe(63); // Multiple operations should work
    expect(result.testsPassedCount).toBe(5); // All 5 feature tests should pass

    // Verify specific state content
    expect(result.stateRetrieved).not.toBeNull();
    expect(result.stateRetrieved?.counter).toBe(21);
    expect(result.stateRetrieved?.message).toBe('state test');
    expect(result.stateRetrieved?.nested.a).toBe(1);
    expect(result.stateRetrieved?.nested.b).toBe(2);
  });

  it('should test comprehensive workflow with different input', async () => {
    /**
     * Test comprehensive workflow with different input value.
     *
     * Validates the same features with a different input to ensure determinism.
     */
    const { handle } = await env.startWorkflow(comprehensiveWorkflow, {
      value: 50,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Validate all features
    expect(result.inputValue).toBe(50);
    expect(result.runResult).toBe(100); // ctx.run() should double value (50*2=100)
    expect(result.stateSet).toBe(true);
    expect(result.stateMatches).toBe(true);
    expect(result.tripleResult).toBe(150); // Triple operation should work (50*3=150)
    expect(result.testsPassedCount).toBe(5); // All 5 feature tests should pass

    // Verify state content
    expect(result.stateRetrieved).not.toBeNull();
    expect(result.stateRetrieved?.counter).toBe(50);
  });

  it('should execute all basic workflows correctly', async () => {
    /**
     * Test all basic workflows execute correctly.
     *
     * Runs multiple different workflow types to ensure basic functionality.
     */
    // Echo workflow
    const { handle: echoHandle } = await env.startWorkflow(echoWorkflow, {
      message: 'hello',
    });
    const echoResult = await env.awaitCompletion(echoHandle, Duration.seconds(30));
    expect(echoResult.message).toBe('hello');

    // Doubler workflow
    const { handle: doublerHandle } = await env.startWorkflow(doublerWorkflow, {
      value: 25,
    });
    const doublerResult = await env.awaitCompletion(doublerHandle, Duration.seconds(30));
    expect(doublerResult.result).toBe(50);

    // Random workflow
    const { handle: randomHandle } = await env.startWorkflow(randomWorkflow, {});
    const randomResult = await env.awaitCompletion(randomHandle, Duration.seconds(30));
    expect(randomResult.uuid).toBeDefined();
    expect(randomResult.randomFloat).toBeGreaterThanOrEqual(0);
    expect(randomResult.randomFloat).toBeLessThan(1.0);

    // Sleep workflow
    const { handle: sleepHandle } = await env.startWorkflow(sleepWorkflow, {
      durationMs: 50,
    });
    const sleepResult = await env.awaitCompletion(sleepHandle, Duration.seconds(30));
    expect(sleepResult.sleptDurationMs).toBe(50);

    // Stateful workflow
    const { handle: statefulHandle } = await env.startWorkflow(statefulWorkflow, {
      key: 'my-key',
      value: 'my-value',
    });
    const statefulResult = await env.awaitCompletion(statefulHandle, Duration.seconds(30));
    expect(statefulResult.storedValue).toBe('my-value');
  });
});
