/**
 * Testing utilities for the Flovyn SDK.
 *
 * This module provides mock contexts and test helpers for unit testing
 * workflows and tasks without requiring a running Flovyn server.
 *
 * @example
 * ```typescript
 * import { MockWorkflowContext } from '@flovyn/sdk/testing';
 *
 * describe('myWorkflow', () => {
 *   it('should complete successfully', async () => {
 *     const ctx = new MockWorkflowContext();
 *     ctx.mockTaskResult(myTask, { result: 'mocked' });
 *
 *     const result = await myWorkflow.run(ctx, { input: 'test' });
 *     expect(result.output).toBe('expected');
 *   });
 * });
 * ```
 *
 * @packageDocumentation
 */

// Mock contexts for unit testing
export {
  MockWorkflowContext,
  type TrackedTask,
  type TrackedTimer,
  type TrackedPromise,
  type TrackedChildWorkflow,
  type TrackedOperation,
} from './mock-workflow-context';

export { MockTaskContext, type TrackedStreamEvent } from './mock-task-context';

// Test environment for E2E testing
export { FlovynTestEnvironment, type TestEnvironmentOptions } from './test-environment';

// Test harness for managing Docker containers
export {
  TestHarness,
  type TestHarnessConfig,
  type HarnessConfig,
  getTestHarness,
  cleanupTestHarness,
} from './test-harness';

// Re-export Duration for convenience in tests
export { Duration } from '../duration';

export const TESTING_VERSION = '0.1.0';
