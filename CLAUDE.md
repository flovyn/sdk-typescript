# CLAUDE.md

This file provides guidance to Claude Code when working with the Flovyn TypeScript SDK.

## Project Overview

This is the TypeScript SDK for Flovyn, a workflow orchestration platform. The SDK provides:
- Native bindings (`@flovyn/native`) - Node.js native module built with NAPI-RS
- High-level SDK (`@flovyn/sdk`) - TypeScript API for defining and running workflows

## Workspace Structure

```
sdk-typescript/
├── packages/
│   ├── native/           # @flovyn/native - Native bindings wrapper
│   │   ├── src/
│   │   │   ├── index.ts  # Re-exports from generated bindings
│   │   │   └── loader.ts # Platform detection and binary loading
│   │   └── package.json
│   └── sdk/              # @flovyn/sdk - High-level TypeScript API
│       ├── src/
│       │   ├── index.ts          # Public exports
│       │   ├── client.ts         # FlovynClient
│       │   ├── workflow.ts       # workflow() factory
│       │   ├── task.ts           # task() factory
│       │   ├── context/          # WorkflowContext, TaskContext
│       │   ├── worker/           # Internal worker implementation
│       │   ├── errors.ts         # Error types
│       │   ├── types.ts          # Type definitions
│       │   ├── duration.ts       # Duration utilities
│       │   └── testing/          # Test utilities
│       ├── tests/
│       └── package.json
├── tests/
│   ├── unit/             # Unit tests (vitest)
│   └── e2e/              # E2E tests (require server)
│       ├── fixtures/     # Test workflows and tasks
│       └── setup.ts      # Test harness
├── examples/             # Example applications
└── package.json
```

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run unit tests
pnpm test

# Run E2E tests (requires server)
pnpm test:e2e

# Lint and format
pnpm lint
pnpm format

# Type check
pnpm typecheck

# Build native module (from sdk-rust/worker-napi)
cd ../sdk-rust/worker-napi
napi build --release
```

## Key Concepts

### Workflow Definition

```typescript
import { workflow } from '@flovyn/sdk';

const myWorkflow = workflow({
  name: 'my-workflow',
  async run(ctx, input: MyInput): Promise<MyOutput> {
    // Use ctx for deterministic operations
    const result = await ctx.task(myTask, { value: input.x });
    return { result: result.value };
  },
});
```

### Task Definition

```typescript
import { task } from '@flovyn/sdk';

const myTask = task({
  name: 'my-task',
  async run(ctx, input: TaskInput): Promise<TaskOutput> {
    // Perform side effects
    return { processed: true };
  },
});
```

### FlovynClient

```typescript
import { FlovynClient } from '@flovyn/sdk';

const client = new FlovynClient({
  serverUrl: 'http://localhost:9090',
  orgId: 'my-org',
  queue: 'default',
});

client.registerWorkflow(myWorkflow);
client.registerTask(myTask);
await client.start();
```

## Development Notes

### Native Module Development

The native module is built from `sdk-rust/worker-napi` using NAPI-RS. During development:

1. Build the native module: `cd ../sdk-rust/worker-napi && napi build`
2. The binary will be at `../sdk-rust/worker-napi/flovyn-worker-napi.{platform}.node`
3. The loader in `@flovyn/native` will find it automatically

### Testing with Mock Contexts

Use `MockWorkflowContext` and `MockTaskContext` for unit testing:

```typescript
import { MockWorkflowContext } from '@flovyn/sdk/testing';

const ctx = new MockWorkflowContext();
ctx.mockTaskResult(myTask, { result: 'mocked' });

const result = await myWorkflow.run(ctx, input);
```

### E2E Testing

E2E tests require a running Flovyn server. Use `FlovynTestEnvironment`:

```typescript
import { FlovynTestEnvironment } from '@flovyn/sdk/testing';

const env = new FlovynTestEnvironment({
  serverUrl: 'http://localhost:9090',
});
await env.start();

const handle = await env.startWorkflow(myWorkflow, input);
const result = await env.awaitCompletion(handle);

await env.stop();
```

## Determinism Requirements

Workflows must be deterministic for replay. Use context methods:
- `ctx.currentTimeMillis()` instead of `Date.now()`
- `ctx.randomUUID()` instead of `crypto.randomUUID()`
- `ctx.random()` instead of `Math.random()`
- `ctx.run('operation', fn)` for side effects

## Reference

- Design: `../dev/docs/design/20260124_create_sdk_for_typescript.md`
- Plan: `../dev/docs/plans/20260125_create_sdk_for_typescript.md`
- Python SDK: `../sdk-python/` (reference implementation)
