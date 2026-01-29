/**
 * Workflow fixtures for E2E tests.
 */

import { workflow, Duration, type WorkflowContext, type WorkflowDefinition } from '@flovyn/sdk';
import { echoTask, addTask } from './tasks';

// ============================================================================
// Input/Output Types
// ============================================================================

export interface EchoInput {
  message: string;
}

export interface EchoOutput {
  message: string;
  timestamp: string;
}

export interface DoublerInput {
  value: number;
}

export interface DoublerOutput {
  result: number;
}

export interface FailingInput {
  errorMessage: string;
}

export interface StatefulInput {
  key: string;
  value: string;
}

export interface StatefulOutput {
  storedValue: string | null;
  allKeys: string[];
}

export interface RunOperationInput {
  operationName: string;
}

export interface RunOperationOutput {
  result: string;
}

export interface RandomOutput {
  uuid: string;
  randomInt: number;
  randomFloat: number;
}

export interface SleepInput {
  durationMs: number;
}

export interface SleepOutput {
  sleptDurationMs: number;
  startTime: string;
  endTime: string;
}

export interface TaskSchedulingInput {
  count: number;
}

export interface TaskSchedulingOutput {
  results: number[];
  total: number;
}

export interface ChildWorkflowInput {
  childInput: unknown;
}

export interface ChildWorkflowOutput {
  childResult: unknown;
}

export interface AwaitPromiseInput {
  promiseName: string;
  timeoutMs: number | null;
}

export interface AwaitPromiseOutput {
  resolvedValue: unknown;
}

export interface ChildFailureInput {
  errorMessage: string;
}

export interface ChildFailureOutput {
  caughtError: string;
}

export interface NestedChildInput {
  depth: number;
  value: string;
}

export interface NestedChildOutput {
  result: string;
  levels: number;
}

export interface ChildLoopInput {
  count: number;
}

export interface ChildLoopOutput {
  results: string[];
  totalCount: number;
}

export interface MixedCommandsInput {
  value: number;
}

export interface MixedCommandsOutput {
  operationResult: string;
  sleepCompleted: boolean;
  taskResult: number;
  finalValue: number;
}

export interface FanOutInput {
  items: string[];
}

export interface FanOutOutput {
  inputCount: number;
  outputCount: number;
  processedItems: string[];
  totalLength: number;
}

export interface LargeBatchInput {
  count: number;
}

export interface LargeBatchOutput {
  taskCount: number;
  total: number;
  minValue: number;
  maxValue: number;
}

export interface MixedParallelOutput {
  success: boolean;
  phase1Results: string[];
  timerFired: boolean;
  phase3Results: number[];
}

export interface ComprehensiveInput {
  value: number;
}

export interface ComprehensiveOutput {
  inputValue: number;
  runResult: number;
  stateSet: boolean;
  stateRetrieved: { counter: number; message: string; nested: { a: number; b: number } } | null;
  stateMatches: boolean;
  tripleResult: number;
  testsPassedCount: number;
  testsPassed: string[];
}

export interface TaskSchedulerInput {
  taskName: string;
  taskInput: Record<string, unknown>;
}

export interface TaskSchedulerOutput {
  taskCompleted: boolean;
  taskResult: Record<string, unknown> | null;
}

export interface TypedTaskInput {
  a: number;
  b: number;
}

export interface TypedTaskOutput {
  result: number;
}

// Signal workflow types
export interface SignalWorkflowInput {
  // Empty input, workflow waits for signal
}

export interface SignalWorkflowOutput {
  signalName: string;
  signalValue: unknown;
}

export interface MultiSignalInput {
  signalCount: number;
}

export interface MultiSignalOutput {
  count: number;
  signals: Array<{ name: string; value: unknown }>;
}

export interface SignalCheckOutput {
  hasSignal: boolean;
  signals: Array<{ name: string; value: unknown }>;
}

// ============================================================================
// Workflows
// ============================================================================

/**
 * Simple workflow that echoes input back with a timestamp.
 */
export const echoWorkflow = workflow<EchoInput, EchoOutput>({
  name: 'echo-workflow',
  run: async (ctx, input) => {
    const timestamp = ctx.currentTime().toISOString();
    return {
      message: input.message,
      timestamp,
    };
  },
});

/**
 * Workflow that doubles the input value.
 */
export const doublerWorkflow = workflow<DoublerInput, DoublerOutput>({
  name: 'doubler-workflow',
  run: async (_ctx, input) => {
    return { result: input.value * 2 };
  },
});

/**
 * Workflow that always fails with a configured error message.
 */
export const failingWorkflow = workflow<FailingInput, never>({
  name: 'failing-workflow',
  run: async (_ctx, input) => {
    throw new Error(input.errorMessage);
  },
});

/**
 * Workflow that tests state get/set/clear operations.
 */
export const statefulWorkflow = workflow<StatefulInput, StatefulOutput>({
  name: 'stateful-workflow',
  run: async (ctx, input) => {
    // Set state
    ctx.set(input.key, input.value);

    // Get state back
    const stored = ctx.get<string>(input.key);

    // Get all keys (by checking the one we set)
    const keys: string[] = [];
    if (ctx.get(input.key) !== null) {
      keys.push(input.key);
    }

    return {
      storedValue: stored,
      allKeys: keys,
    };
  },
});

/**
 * Workflow that tests ctx.run() for durable side effects.
 */
export const runOperationWorkflow = workflow<RunOperationInput, RunOperationOutput>({
  name: 'run-operation-workflow',
  run: async (ctx, input) => {
    // Run an operation that would be non-deterministic
    const result = await ctx.run(input.operationName, () => {
      return `executed-${input.operationName}`;
    });

    return { result };
  },
});

/**
 * Workflow that tests deterministic random generation.
 */
export const randomWorkflow = workflow<Record<string, never>, RandomOutput>({
  name: 'random-workflow',
  run: async (ctx) => {
    const uuid = ctx.randomUUID();
    const randomValue = ctx.random();

    return {
      uuid,
      randomInt: Math.floor(randomValue * 1000),
      randomFloat: randomValue,
    };
  },
});

/**
 * Workflow that tests durable timers.
 */
export const sleepWorkflow = workflow<SleepInput, SleepOutput>({
  name: 'sleep-workflow',
  run: async (ctx, input) => {
    const startTime = ctx.currentTime();

    await ctx.sleep(Duration.milliseconds(input.durationMs));

    const endTime = ctx.currentTime();

    return {
      sleptDurationMs: input.durationMs,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  },
});

/**
 * Workflow that waits for an external promise to be resolved.
 */
export const awaitPromiseWorkflow = workflow<AwaitPromiseInput, AwaitPromiseOutput>({
  name: 'await-promise-workflow',
  run: async (ctx, input) => {
    const timeout = input.timeoutMs !== null ? Duration.milliseconds(input.timeoutMs) : undefined;

    const value = await ctx.promise<unknown>(input.promiseName, { timeout });

    return { resolvedValue: value };
  },
});

/**
 * Workflow that schedules multiple tasks and aggregates results.
 */
export const taskSchedulingWorkflow = workflow<TaskSchedulingInput, TaskSchedulingOutput>({
  name: 'task-scheduling-workflow',
  run: async (ctx, input) => {
    const results: number[] = [];
    let runningTotal = 0;

    for (let i = 0; i < input.count; i++) {
      const result = await ctx.schedule(addTask, { a: runningTotal, b: i + 1 });
      runningTotal = result.sum;
      results.push(runningTotal);
    }

    return {
      results,
      total: runningTotal,
    };
  },
});

/**
 * Workflow that executes multiple tasks sequentially.
 */
export const multiTaskWorkflow = workflow<TaskSchedulingInput, TaskSchedulingOutput>({
  name: 'multi-task-workflow',
  run: async (ctx, input) => {
    const results: number[] = [];
    let total = 0;

    for (let i = 0; i < input.count; i++) {
      const result = await ctx.schedule(addTask, { a: i, b: i });
      total += result.sum;
      results.push(result.sum);
    }

    return {
      results,
      total,
    };
  },
});

/**
 * Workflow that executes multiple tasks in parallel.
 */
export const parallelTasksWorkflow = workflow<TaskSchedulingInput, TaskSchedulingOutput>({
  name: 'parallel-tasks-workflow',
  run: async (ctx, input) => {
    // Schedule all tasks
    const handles = [];
    for (let i = 0; i < input.count; i++) {
      const handle = ctx.schedule(addTask, { a: i, b: i });
      handles.push(handle);
    }

    // Await all results
    const results: number[] = [];
    let total = 0;
    for (const handle of handles) {
      const result = await handle.result();
      results.push(result.sum);
      total += result.sum;
    }

    return {
      results,
      total,
    };
  },
});

/**
 * Workflow that executes a child workflow.
 */
export const childWorkflowWorkflow = workflow<ChildWorkflowInput, ChildWorkflowOutput>({
  name: 'child-workflow-workflow',
  run: async (ctx, input) => {
    // Execute the echo workflow as a child
    const result = await ctx.scheduleWorkflow(echoWorkflow, {
      message: String(input.childInput),
    });

    return { childResult: result };
  },
});

/**
 * Workflow that tests child workflow failure handling.
 */
export const childFailureWorkflow = workflow<ChildFailureInput, ChildFailureOutput>({
  name: 'child-failure-workflow',
  run: async (ctx, input) => {
    try {
      await ctx.scheduleWorkflow(failingWorkflow, {
        errorMessage: input.errorMessage,
      });
      return { caughtError: '' };
    } catch (e) {
      return { caughtError: String(e) };
    }
  },
});

/**
 * Workflow that can be nested to test multi-level child workflows.
 */
export const nestedChildWorkflow: WorkflowDefinition<NestedChildInput, NestedChildOutput> = workflow<NestedChildInput, NestedChildOutput>({
  name: 'nested-child-workflow',
  run: async (ctx, input) => {
    if (input.depth <= 1) {
      // Base case: just return the value
      return { result: `leaf:${input.value}`, levels: 1 };
    } else {
      // Recursive case: call child workflow with reduced depth
      const childResult = await ctx.scheduleWorkflow(nestedChildWorkflow, {
        depth: input.depth - 1,
        value: input.value,
      });
      return {
        result: `level${input.depth}:${childResult.result}`,
        levels: childResult.levels + 1,
      };
    }
  },
});

/**
 * Workflow that executes child workflows in a loop.
 */
export const childLoopWorkflow = workflow<ChildLoopInput, ChildLoopOutput>({
  name: 'child-loop-workflow',
  run: async (ctx, input) => {
    const results: string[] = [];

    for (let i = 0; i < input.count; i++) {
      // Execute child echo workflow for each iteration
      const result = await ctx.scheduleWorkflow(echoWorkflow, {
        message: `child-${i}`,
      });
      results.push(result.message);
    }

    return {
      results,
      totalCount: results.length,
    };
  },
});

/**
 * Workflow that tests mixed command types for replay verification.
 */
export const mixedCommandsWorkflow = workflow<MixedCommandsInput, MixedCommandsOutput>({
  name: 'mixed-commands-workflow',
  run: async (ctx, input) => {
    // Step 1: Run a side-effect operation
    const opResult = await ctx.run('compute-step', () => `computed-${input.value}`);

    // Step 2: Sleep for a short duration
    await ctx.sleep(Duration.milliseconds(100));

    // Step 3: Execute a task
    const taskResult = await ctx.schedule(addTask, {
      a: input.value,
      b: 10,
    });

    // Step 4: Run another operation
    const finalValue = await ctx.run('finalize-step', () => input.value * 2);

    return {
      operationResult: opResult,
      sleepCompleted: true,
      taskResult: taskResult.sum,
      finalValue,
    };
  },
});

/**
 * Workflow that demonstrates fan-out/fan-in pattern.
 */
export const fanOutFanInWorkflow = workflow<FanOutInput, FanOutOutput>({
  name: 'fan-out-fan-in-workflow',
  run: async (ctx, input) => {
    // Fan-out: Schedule all tasks in parallel
    const handles = [];
    for (const item of input.items) {
      const handle = ctx.schedule(echoTask, { message: item });
      handles.push(handle);
    }

    // Fan-in: Collect all results
    const processed: string[] = [];
    let totalLength = 0;
    for (const handle of handles) {
      const result = await handle.result();
      processed.push(result.message);
      totalLength += result.message.length;
    }

    return {
      inputCount: input.items.length,
      outputCount: processed.length,
      processedItems: processed,
      totalLength,
    };
  },
});

/**
 * Workflow that schedules many parallel tasks.
 */
export const largeBatchWorkflow = workflow<LargeBatchInput, LargeBatchOutput>({
  name: 'large-batch-workflow',
  run: async (ctx, input) => {
    // Schedule many tasks in parallel
    const handles = [];
    for (let i = 0; i < input.count; i++) {
      const handle = ctx.schedule(addTask, { a: i, b: 1 });
      handles.push(handle);
    }

    // Collect results
    const results: number[] = [];
    for (const handle of handles) {
      const result = await handle.result();
      results.push(result.sum);
    }

    return {
      taskCount: results.length,
      total: results.reduce((a, b) => a + b, 0),
      minValue: Math.min(...results),
      maxValue: Math.max(...results),
    };
  },
});

/**
 * Workflow that combines parallel tasks with timers.
 */
export const mixedParallelWorkflow = workflow<Record<string, never>, MixedParallelOutput>({
  name: 'mixed-parallel-workflow',
  run: async (ctx) => {
    // Phase 1: Two parallel echo tasks
    const handle1 = ctx.schedule(echoTask, { message: 'task-1' });
    const handle2 = ctx.schedule(echoTask, { message: 'task-2' });

    const result1 = await handle1.result();
    const result2 = await handle2.result();
    const phase1Results = [result1.message, result2.message];

    // Phase 2: Timer
    await ctx.sleep(Duration.milliseconds(100));
    const timerFired = true;

    // Phase 3: Three parallel add tasks
    const handles = [];
    for (let i = 0; i < 3; i++) {
      const handle = ctx.schedule(addTask, { a: i, b: i });
      handles.push(handle);
    }

    const phase3Results: number[] = [];
    for (const handle of handles) {
      const result = await handle.result();
      phase3Results.push(result.sum);
    }

    return {
      success: true,
      phase1Results,
      timerFired,
      phase3Results,
    };
  },
});

/**
 * Workflow that tests multiple SDK features in a single execution.
 */
export const comprehensiveWorkflow = workflow<ComprehensiveInput, ComprehensiveOutput>({
  name: 'comprehensive-workflow',
  run: async (ctx, input) => {
    const testsPassed: string[] = [];

    // Test 1: Basic input processing
    const inputValue = input.value;
    testsPassed.push('basic_input');

    // Test 2: Operation recording with ctx.run()
    const runResult = await ctx.run('double-operation', () => input.value * 2);
    testsPassed.push('run_operation');

    // Test 3: State set
    const stateKey = 'test-state-key';
    const stateValue = {
      counter: input.value,
      message: 'state test',
      nested: { a: 1, b: 2 },
    };
    ctx.set(stateKey, stateValue);
    testsPassed.push('state_set');

    // Test 4: State get (should return what we just set)
    const retrieved = ctx.get<{ counter: number; message: string; nested: { a: number; b: number } }>(stateKey);

    // Verify state matches
    const stateMatches = JSON.stringify(retrieved) === JSON.stringify(stateValue);
    if (stateMatches) {
      testsPassed.push('state_get');
    }

    // Test 5: Multiple operations to test replay
    const tripleResult = await ctx.run('triple-operation', () => input.value * 3);
    testsPassed.push('multiple_operations');

    return {
      inputValue,
      runResult,
      stateSet: true,
      stateRetrieved: retrieved,
      stateMatches,
      tripleResult,
      testsPassedCount: testsPassed.length,
      testsPassed,
    };
  },
});

/**
 * Generic workflow that schedules a task by name.
 * Used for testing arbitrary tasks without needing a specific workflow.
 */
export const taskSchedulerWorkflow = workflow<TaskSchedulerInput, TaskSchedulerOutput>({
  name: 'task-scheduler-workflow',
  run: async (ctx, input) => {
    // Use the task name to schedule the appropriate task
    const result = await ctx.scheduleByName(input.taskName, input.taskInput);

    return {
      taskCompleted: true,
      taskResult: result as Record<string, unknown>,
    };
  },
});

/**
 * Workflow that uses the typed API to execute a task.
 */
export const typedTaskWorkflow = workflow<TypedTaskInput, TypedTaskOutput>({
  name: 'typed-task-workflow',
  run: async (ctx, input) => {
    // Use the typed API: pass task definition instead of string
    const result = await ctx.schedule(addTask, {
      a: input.a,
      b: input.b,
    });

    return { result: result.sum };
  },
});

/**
 * Workflow that waits for a single signal and returns it.
 */
export const signalWorkflow = workflow<SignalWorkflowInput, SignalWorkflowOutput>({
  name: 'signal-workflow',
  run: async (ctx) => {
    // Wait for a signal
    const signal = await ctx.waitForSignal<unknown>();
    return {
      signalName: signal.name,
      signalValue: signal.value,
    };
  },
});

/**
 * Workflow that waits for multiple signals.
 */
export const multiSignalWorkflow = workflow<MultiSignalInput, MultiSignalOutput>({
  name: 'multi-signal-workflow',
  run: async (ctx, input) => {
    const signals: Array<{ name: string; value: unknown }> = [];

    for (let i = 0; i < input.signalCount; i++) {
      const signal = await ctx.waitForSignal<unknown>();
      signals.push({ name: signal.name, value: signal.value });
    }

    return {
      count: signals.length,
      signals,
    };
  },
});

/**
 * Workflow that uses hasSignal and drainSignals for non-blocking check.
 */
export const signalCheckWorkflow = workflow<SignalWorkflowInput, SignalCheckOutput>({
  name: 'signal-check-workflow',
  run: async (ctx) => {
    // Small delay to allow signals to arrive
    await ctx.sleep(Duration.milliseconds(500));

    // Check if any signals are pending
    const hasSignal = ctx.hasSignal();

    // Drain all pending signals
    const signals = ctx.drainSignals<unknown>();

    return {
      hasSignal,
      signals: signals.map((s) => ({ name: s.name, value: s.value })),
    };
  },
});

/**
 * All workflows for registration.
 */
export const allWorkflows: WorkflowDefinition<unknown, unknown>[] = [
  echoWorkflow,
  doublerWorkflow,
  failingWorkflow,
  statefulWorkflow,
  runOperationWorkflow,
  randomWorkflow,
  sleepWorkflow,
  awaitPromiseWorkflow,
  taskSchedulingWorkflow,
  multiTaskWorkflow,
  parallelTasksWorkflow,
  childWorkflowWorkflow,
  childFailureWorkflow,
  nestedChildWorkflow,
  childLoopWorkflow,
  mixedCommandsWorkflow,
  fanOutFanInWorkflow,
  largeBatchWorkflow,
  mixedParallelWorkflow,
  comprehensiveWorkflow,
  taskSchedulerWorkflow,
  typedTaskWorkflow,
  signalWorkflow,
  multiSignalWorkflow,
  signalCheckWorkflow,
];
