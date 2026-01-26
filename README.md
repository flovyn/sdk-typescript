# Flovyn TypeScript SDK

The official TypeScript SDK for [Flovyn](https://flovyn.com) - a durable workflow orchestration platform.

## Features

- **Durable Workflows**: Define workflows that survive process restarts and failures
- **Type-Safe**: Full TypeScript support with generics for inputs and outputs
- **Replay-Safe**: Deterministic execution with automatic replay handling
- **Tasks**: Schedule and execute tasks with retries, timeouts, and progress reporting
- **Timers**: Durable timers that persist across restarts
- **External Promises**: Wait for external events with timeout support
- **Child Workflows**: Compose workflows by calling other workflows
- **State Management**: Store and retrieve workflow state
- **Streaming**: Stream tokens, progress, and data from tasks

## Installation

```bash
npm install @flovyn/sdk
# or
pnpm add @flovyn/sdk
# or
yarn add @flovyn/sdk
```

## Quick Start

### Define a Task

Tasks perform the actual work and can include non-deterministic operations like API calls:

```typescript
import { task, Duration } from '@flovyn/sdk';

interface EmailInput {
  to: string;
  subject: string;
  body: string;
}

interface EmailOutput {
  messageId: string;
  sent: boolean;
}

const sendEmailTask = task<EmailInput, EmailOutput>({
  name: 'send-email',
  timeout: Duration.minutes(1),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(1),
    backoffMultiplier: 2,
  },
  async run(ctx, input) {
    ctx.reportProgress(0.5);

    // Perform the actual email sending
    const result = await emailService.send(input);

    ctx.reportProgress(1.0);
    return { messageId: result.id, sent: true };
  },
});
```

### Define a Workflow

Workflows orchestrate tasks and maintain durable state:

```typescript
import { workflow, Duration } from '@flovyn/sdk';

interface OrderInput {
  orderId: string;
  items: string[];
  customerEmail: string;
}

interface OrderOutput {
  status: 'completed' | 'cancelled';
  total: number;
}

const processOrderWorkflow = workflow<OrderInput, OrderOutput>({
  name: 'process-order',
  async run(ctx, input) {
    // Use ctx for all operations to ensure determinism
    ctx.log.info('Processing order', { orderId: input.orderId });

    // Schedule a task
    const priceResult = await ctx.schedule(calculatePriceTask, {
      items: input.items,
    });

    // Store state (survives restarts)
    ctx.set('total', priceResult.total);

    // Wait for payment (durable timer)
    await ctx.sleep(Duration.seconds(5));

    // Send confirmation email
    await ctx.schedule(sendEmailTask, {
      to: input.customerEmail,
      subject: 'Order Confirmed',
      body: `Your order ${input.orderId} has been processed.`,
    });

    return { status: 'completed', total: priceResult.total };
  },
});
```

### Run with FlovynClient

```typescript
import { FlovynClient } from '@flovyn/sdk';

const client = new FlovynClient({
  serverUrl: 'http://localhost:9090',
  orgId: 'my-org',
  queue: 'default',
});

// Register workflows and tasks
client.registerWorkflow(processOrderWorkflow);
client.registerTask(calculatePriceTask);
client.registerTask(sendEmailTask);

// Start the client (begins processing)
await client.start();

// Start a workflow
const handle = await client.startWorkflow(processOrderWorkflow, {
  orderId: 'ORD-123',
  items: ['item-1', 'item-2'],
  customerEmail: 'customer@example.com',
});

// Wait for the result
const result = await handle.result();
console.log('Order completed:', result);

// Stop gracefully
await client.stop();
```

## Workflow Context API

The workflow context provides deterministic operations:

```typescript
// Execute a task and await result
const result = await ctx.schedule(myTask, input);

// Schedule a task (non-blocking, returns handle)
const handle = ctx.scheduleAsync(myTask, input);
const result = await handle.result();

// Start a child workflow and await result
const childResult = await ctx.scheduleWorkflow(childWorkflow, input);

// Start a child workflow (non-blocking, returns handle)
const childHandle = ctx.scheduleWorkflowAsync(childWorkflow, input);
const childResult = await childHandle.result();

// Durable timer
await ctx.sleep(Duration.minutes(5));
await ctx.sleepUntil(new Date('2024-12-31'));

// External promise (resolved from outside)
const approval = await ctx.promise<boolean>('approval', {
  timeout: Duration.hours(24),
});

// Memoized side effects
const apiResult = await ctx.run('fetch-data', async () => {
  return await fetch('https://api.example.com/data');
});

// State management
ctx.set('key', value);
const value = ctx.get<T>('key');
ctx.clear('key');
ctx.clearAll();
const keys = ctx.stateKeys();

// Deterministic time and randomness
const now = ctx.currentTime();
const uuid = ctx.randomUUID();
const random = ctx.random();

// Cancellation
ctx.checkCancellation(); // throws if cancelled
if (ctx.isCancellationRequested) { ... }
```

## Task Context API

The task context provides execution utilities:

```typescript
// Progress reporting (0.0 to 1.0)
ctx.reportProgress(0.5);

// Heartbeat for long-running tasks
ctx.heartbeat();

// Cancellation checking
ctx.checkCancellation();
if (ctx.isCancelled) { ... }

// Streaming (for LLM-style output)
ctx.streamToken('Hello');
ctx.streamProgress(0.75);
ctx.streamData({ custom: 'data' });
ctx.streamError('Non-fatal error');

// Metadata
ctx.taskExecutionId;
ctx.taskKind;
ctx.attempt; // 1-based retry count
ctx.log.info('Processing...');
```

## Testing

Use mock contexts for unit testing:

```typescript
import { MockWorkflowContext, MockTaskContext } from '@flovyn/sdk/testing';

describe('processOrderWorkflow', () => {
  it('should complete successfully', async () => {
    const ctx = new MockWorkflowContext();

    // Mock task results
    ctx.mockTaskResult(calculatePriceTask, { total: 100 });
    ctx.mockTaskResult(sendEmailTask, { messageId: 'msg-1', sent: true });

    const result = await processOrderWorkflow.run(ctx, {
      orderId: 'test-123',
      items: ['item-1'],
      customerEmail: 'test@example.com',
    });

    expect(result.status).toBe('completed');
    expect(result.total).toBe(100);
    expect(ctx.executedTasks).toHaveLength(2);
  });
});
```

## Duration Utilities

```typescript
import { Duration } from '@flovyn/sdk';

Duration.milliseconds(100);
Duration.seconds(30);
Duration.minutes(5);
Duration.hours(1);
Duration.days(7);

// Arithmetic
const d1 = Duration.seconds(10);
const d2 = d1.add(Duration.seconds(5));
const d3 = d1.multiply(2);

// Comparison
d1.isGreaterThan(d2);
d1.isLessThan(d2);
d1.equals(d2);

// Conversion
d1.toMilliseconds();
d1.toSeconds();
d1.toMinutes();
```

## Error Handling

The SDK provides specific error types:

```typescript
import {
  FlovynError,
  WorkflowCancelled,
  TaskFailed,
  PromiseTimeout,
  DeterminismViolation,
} from '@flovyn/sdk';

try {
  await handle.result();
} catch (error) {
  if (error instanceof WorkflowCancelled) {
    console.log('Workflow was cancelled');
  } else if (error instanceof TaskFailed) {
    console.log('Task failed:', error.message, 'Retryable:', error.retryable);
  } else if (error instanceof PromiseTimeout) {
    console.log('Promise timed out:', error.promiseId);
  }
}
```

## Requirements

- Node.js 18+
- Flovyn Server (for production use)

## License

Apache-2.0
