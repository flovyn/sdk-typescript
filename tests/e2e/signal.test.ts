/**
 * E2E tests for signal functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, signalWorkflow, multiSignalWorkflow, signalCheckWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Signal E2E Tests', () => {
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

  it('should signal-with-start a new workflow', async () => {
    /**
     * Test signal-with-start: atomically start workflow and send signal.
     *
     * Flow:
     * 1. Call signalWithStartWorkflow() with new workflow
     * 2. Workflow is created and signal is delivered
     * 3. Workflow receives signal via waitForSignal()
     * 4. Workflow completes with signal value
     */
    const { handle, workflowCreated } = await env.signalWithStartWorkflow(
      signalWorkflow,
      `signal-test-${Date.now()}`,
      {},
      'greeting',
      { message: 'Hello from signal!' }
    );

    expect(workflowCreated).toBe(true);

    // Wait for workflow to complete
    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify the output contains the signal
    expect(result.signalName).toBe('greeting');
    expect(result.signalValue).toEqual({ message: 'Hello from signal!' });
  });

  it('should signal an existing workflow', async () => {
    /**
     * Test signal to existing workflow.
     *
     * Flow:
     * 1. Start workflow that waits for signal
     * 2. Workflow suspends waiting for signal
     * 3. Send signal via signalWorkflow()
     * 4. Workflow receives signal and completes
     */
    const { handle } = await env.startWorkflow(signalWorkflow, {});

    // Wait for workflow to suspend
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send signal to the workflow
    const signalSeq = await env.signalWorkflow(handle, 'user-action', {
      action: 'approve',
      user: 'admin',
    });

    expect(signalSeq).toBeGreaterThan(0);

    // Wait for workflow to complete
    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify the output contains the signal
    expect(result.signalName).toBe('user-action');
    expect(result.signalValue).toEqual({ action: 'approve', user: 'admin' });
  });

  it('should handle multiple signals', async () => {
    /**
     * Test multiple signals to workflow.
     *
     * Flow:
     * 1. Start workflow that waits for multiple signals
     * 2. Send multiple signals
     * 3. Workflow receives all signals in order
     */
    const { handle } = await env.startWorkflow(multiSignalWorkflow, { signalCount: 3 });

    // Wait for workflow to start and suspend
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send 3 signals
    for (let i = 1; i <= 3; i++) {
      await env.signalWorkflow(handle, `message-${i}`, { content: `Message ${i}` });
      // Small delay between signals
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Wait for workflow to complete
    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify all signals were received
    expect(result.count).toBe(3);
    expect(result.signals).toHaveLength(3);
    expect(result.signals[0].name).toBe('message-1');
    expect(result.signals[1].name).toBe('message-2');
    expect(result.signals[2].name).toBe('message-3');
  });

  it('should signal-with-start to existing workflow', async () => {
    /**
     * Test signal-with-start idempotency.
     *
     * Flow:
     * 1. Start workflow via signal_with_start
     * 2. Call signal_with_start again with same workflow_id
     * 3. Second call should NOT create new workflow, just add signal
     */
    const workflowId = `signal-existing-test-${Date.now()}`;

    // First signal_with_start creates the workflow
    const result1 = await env.signalWithStartWorkflow(
      multiSignalWorkflow,
      workflowId,
      { signalCount: 2 },
      'signal-1',
      { seq: 1 }
    );

    expect(result1.workflowCreated).toBe(true);

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Second signal_with_start to same workflow_id
    const result2 = await env.signalWithStartWorkflow(
      multiSignalWorkflow,
      workflowId,
      { signalCount: 2 },
      'signal-2',
      { seq: 2 }
    );

    expect(result2.workflowCreated).toBe(false);
    expect(result2.handle.workflowId).toBe(result1.handle.workflowId);

    // Wait for workflow to complete (it expects 2 signals)
    const result = await env.awaitCompletion(result1.handle, Duration.seconds(30));

    // Verify both signals were received
    expect(result.signals).toHaveLength(2);
  });

  it('should check hasSignal and drain signals', async () => {
    /**
     * Test hasSignal and drainSignals APIs.
     *
     * Flow:
     * 1. Send signals via signal_with_start
     * 2. Workflow checks hasSignal() and drains all
     */
    const { handle, workflowCreated } = await env.signalWithStartWorkflow(
      signalCheckWorkflow,
      `signal-check-${Date.now()}`,
      {},
      'initial',
      { data: 'first' }
    );

    expect(workflowCreated).toBe(true);

    // Send another signal immediately
    await env.signalWorkflow(handle, 'second', { data: 'second' });

    // Wait for workflow to complete
    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify the output
    expect(result.hasSignal).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(1);
  });
});
