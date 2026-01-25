/**
 * E2E tests for the typed API (passing workflow/task definitions instead of strings).
 *
 * These tests verify that the typed API works correctly for use cases
 * where the client and worker are on the same machine (single-server).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  echoWorkflow,
  doublerWorkflow,
  typedTaskWorkflow,
  type EchoInput,
  type EchoOutput,
  type DoublerInput,
  type DoublerOutput,
  type TypedTaskInput,
  type TypedTaskOutput,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Typed API E2E Tests', () => {
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

  it('should start workflow with typed input and output', async () => {
    /**
     * Test starting a workflow using the typed API with typed input and output models.
     */
    // Use the typed API: pass workflow definition and typed input
    const input: EchoInput = { message: 'Hello from typed API!' };
    const handle = await env.startWorkflow(echoWorkflow, input);

    const result = await env.awaitCompletion(handle);

    // Result should match EchoOutput type
    const output: EchoOutput = result;
    expect(output.message).toBe('Hello from typed API!');
    expect(output.timestamp).toBeDefined();
  });

  it('should start doubler workflow with typed input and output', async () => {
    /**
     * Test starting a doubler workflow using the typed API with typed input and output.
     */
    // Use the typed API: pass workflow definition and typed input
    const input: DoublerInput = { value: 21 };
    const handle = await env.startWorkflow(doublerWorkflow, input);

    const result = await env.awaitCompletion(handle);

    // Result should match DoublerOutput type
    const output: DoublerOutput = result;
    expect(output.result).toBe(42);
  });

  it('should use start_and_await with typed input and output', async () => {
    /**
     * Test startAndAwait helper with typed API and typed input/output.
     */
    // Use the typed API with the combined startAndAwait method
    const input: EchoInput = { message: 'Combined start and await!' };
    const result = await env.startAndAwait(echoWorkflow, input);

    // Result should match EchoOutput type
    const output: EchoOutput = result;
    expect(output.message).toBe('Combined start and await!');
  });

  it('should execute typed task within workflow', async () => {
    /**
     * Test workflow that uses typed API internally to execute a task.
     *
     * This verifies that ctx.task(TaskDefinition, input) works within a workflow.
     */
    // The typedTaskWorkflow internally uses addTask definition instead of string
    const input: TypedTaskInput = { a: 10, b: 32 };
    const handle = await env.startWorkflow(typedTaskWorkflow, input);

    const result = await env.awaitCompletion(handle);

    // Result should match TypedTaskOutput type
    const output: TypedTaskOutput = result;
    expect(output.result).toBe(42); // 10 + 32
  });
});
