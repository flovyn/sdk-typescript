/**
 * Task fixtures for E2E tests.
 */

import { task, Duration, type TaskDefinition } from '@flovyn/sdk';

// ============================================================================
// Input/Output Types
// ============================================================================

export interface EchoTaskInput {
  message: string;
}

export interface EchoTaskOutput {
  message: string;
}

export interface AddInput {
  a: number;
  b: number;
}

export interface AddOutput {
  sum: number;
}

export interface SlowTaskInput {
  durationMs: number;
}

export interface SlowTaskOutput {
  completed: boolean;
  durationMs: number;
}

export interface FailingTaskInput {
  failCount: number;
}

export interface FailingTaskOutput {
  attempts: number;
}

export interface ProgressTaskInput {
  steps: number;
}

export interface ProgressTaskOutput {
  completedSteps: number;
}

// ============================================================================
// Tasks
// ============================================================================

/**
 * Simple task that echoes input back.
 */
export const echoTask = task<EchoTaskInput, EchoTaskOutput>({
  name: 'echo-task',
  run: async (_ctx, input) => {
    return { message: input.message };
  },
});

/**
 * Task that adds two numbers.
 */
export const addTask = task<AddInput, AddOutput>({
  name: 'add-task',
  run: async (_ctx, input) => {
    return { sum: input.a + input.b };
  },
});

/**
 * Task that sleeps for a configurable duration.
 */
export const slowTask = task<SlowTaskInput, SlowTaskOutput>({
  name: 'slow-task',
  run: async (ctx, input) => {
    ctx.reportProgress(0);

    // Sleep in smaller increments to allow cancellation checks
    let remainingMs = input.durationMs;
    const stepMs = Math.min(100, remainingMs);

    while (remainingMs > 0) {
      ctx.checkCancellation();

      await new Promise((resolve) => setTimeout(resolve, stepMs));
      remainingMs -= stepMs;

      const progress = 1.0 - remainingMs / input.durationMs;
      ctx.reportProgress(progress);
    }

    ctx.reportProgress(1.0);

    return {
      completed: true,
      durationMs: input.durationMs,
    };
  },
});

// Track attempts for failing task (using a simple approach)
const failingTaskAttempts = new Map<string, number>();

/**
 * Task that fails a configurable number of times before succeeding.
 * Useful for testing retry logic.
 */
export const failingTask = task<FailingTaskInput, FailingTaskOutput>({
  name: 'failing-task',
  run: async (ctx, input) => {
    // Track attempts by task execution ID
    const key = ctx.taskExecutionId;
    const currentAttempt = (failingTaskAttempts.get(key) || 0) + 1;
    failingTaskAttempts.set(key, currentAttempt);

    if (currentAttempt <= input.failCount) {
      throw new Error(`Intentional failure ${currentAttempt}/${input.failCount}`);
    }

    // Clean up tracking
    failingTaskAttempts.delete(key);

    return { attempts: currentAttempt };
  },
});

/**
 * Task that reports progress in steps.
 */
export const progressTask = task<ProgressTaskInput, ProgressTaskOutput>({
  name: 'progress-task',
  run: async (ctx, input) => {
    for (let i = 0; i < input.steps; i++) {
      ctx.checkCancellation();

      const progress = (i + 1) / input.steps;
      ctx.reportProgress(progress);

      // Small delay between steps
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return { completedSteps: input.steps };
  },
});

// ============================================================================
// Streaming Tasks
// ============================================================================

export interface StreamingTokenInput {
  tokens: string[];
}

export interface StreamingTokenOutput {
  tokenCount: number;
}

export interface StreamingProgressInput {
  steps: number;
}

export interface StreamingProgressOutput {
  finalProgress: number;
}

export interface StreamingDataInput {
  items: Record<string, unknown>[];
}

export interface StreamingDataOutput {
  itemsStreamed: number;
}

export interface StreamingErrorInput {
  errorMessage: string;
  errorCode?: string;
}

export interface StreamingErrorOutput {
  errorSent: boolean;
}

export interface StreamingAllTypesInput {
  token: string;
  progress: number;
  data: Record<string, unknown>;
  errorMessage: string;
}

export interface StreamingAllTypesOutput {
  allTypesSent: boolean;
}

/**
 * Task that streams tokens.
 */
export const streamingTokenTask = task<StreamingTokenInput, StreamingTokenOutput>({
  name: 'streaming-token-task',
  run: async (ctx, input) => {
    for (const token of input.tokens) {
      ctx.streamToken(token);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { tokenCount: input.tokens.length };
  },
});

/**
 * Task that streams progress updates.
 */
export const streamingProgressTask = task<StreamingProgressInput, StreamingProgressOutput>({
  name: 'streaming-progress-task',
  run: async (ctx, input) => {
    for (let i = 0; i < input.steps; i++) {
      const progress = (i + 1) / input.steps;
      ctx.streamProgress(progress);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { finalProgress: 1.0 };
  },
});

/**
 * Task that streams arbitrary data.
 */
export const streamingDataTask = task<StreamingDataInput, StreamingDataOutput>({
  name: 'streaming-data-task',
  run: async (ctx, input) => {
    for (const item of input.items) {
      ctx.streamData(item);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { itemsStreamed: input.items.length };
  },
});

/**
 * Task that streams an error notification.
 */
export const streamingErrorTask = task<StreamingErrorInput, StreamingErrorOutput>({
  name: 'streaming-error-task',
  run: async (ctx, input) => {
    ctx.streamError(input.errorMessage);
    return { errorSent: true };
  },
});

/**
 * Task that streams all event types.
 */
export const streamingAllTypesTask = task<StreamingAllTypesInput, StreamingAllTypesOutput>({
  name: 'streaming-all-types-task',
  run: async (ctx, input) => {
    // Stream a token
    ctx.streamToken(input.token);

    // Stream progress
    ctx.streamProgress(input.progress);

    // Stream data
    ctx.streamData(input.data);

    // Stream error notification (recoverable)
    ctx.streamError(input.errorMessage);

    return { allTypesSent: true };
  },
});

/**
 * All tasks for registration.
 */
export const allTasks: TaskDefinition<unknown, unknown>[] = [
  echoTask,
  addTask,
  slowTask,
  failingTask,
  progressTask,
  streamingTokenTask,
  streamingProgressTask,
  streamingDataTask,
  streamingErrorTask,
  streamingAllTypesTask,
];
