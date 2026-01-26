# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Breaking Changes

### WorkflowContext API Changes

The WorkflowContext API has been updated for consistency with SDK-Kotlin (the reference implementation).

#### Method Renames

| Old Name | New Name |
|----------|----------|
| `task()` | `schedule()` |
| `taskByName()` | `scheduleByName()` |
| `workflow()` | `scheduleWorkflow()` |
| `getState()` | `get()` |
| `setState()` | `set()` |
| `clearState()` | `clear()` |

#### Removed Methods

- `scheduleTask()` - Use `schedule()` instead (returns awaitable `TaskHandle`)
- `scheduleWorkflowAsync()` - Use `scheduleWorkflow()` instead (returns awaitable `WorkflowHandle`)

#### New Methods

- `clearAll()` - Clear all workflow state
- `stateKeys()` - Get all state keys

#### Handle Types

Both `TaskHandle` and `WorkflowHandle` now implement `PromiseLike`, so they can be awaited directly:

```typescript
// TaskHandle<O> - can be awaited directly
const result = await ctx.schedule(myTask, input);

// Or access properties before awaiting
const handle = ctx.schedule(myTask, input);
console.log(handle.taskExecutionId);
const result = await handle;

// WorkflowHandle<O> - can be awaited directly
const result = await ctx.scheduleWorkflow(childWorkflow, input);

// Or access properties before awaiting
const handle = ctx.scheduleWorkflow(childWorkflow, input);
console.log(handle.workflowId);
const result = await handle;
```

### Migration Guide

**Before:**
```typescript
const myWorkflow = workflow({
  name: 'my-workflow',
  async run(ctx, input: MyInput): Promise<MyOutput> {
    // Execute task
    const result = await ctx.task(myTask, { value: input.value });

    // Schedule task (non-blocking)
    const handle = ctx.scheduleTask(myTask, { value: input.value });
    const result = await handle.result();

    // Execute child workflow
    const childResult = await ctx.workflow(childWorkflow, {});

    // State management
    ctx.setState('key', 'value');
    const value = ctx.getState<string>('key');
    ctx.clearState('key');

    return { result: result.value };
  },
});
```

**After:**
```typescript
const myWorkflow = workflow({
  name: 'my-workflow',
  async run(ctx, input: MyInput): Promise<MyOutput> {
    // Execute task - schedule() returns awaitable TaskHandle
    const result = await ctx.schedule(myTask, { value: input.value });

    // Run tasks concurrently - no need for scheduleAsync
    const [r1, r2] = await Promise.all([
      ctx.schedule(task1, input1),
      ctx.schedule(task2, input2),
    ]);

    // Execute child workflow - scheduleWorkflow() returns awaitable WorkflowHandle
    const childResult = await ctx.scheduleWorkflow(childWorkflow, {});

    // Run child workflows concurrently
    const [c1, c2] = await Promise.all([
      ctx.scheduleWorkflow(workflow1, input1),
      ctx.scheduleWorkflow(workflow2, input2),
    ]);

    // State management
    ctx.set('key', 'value');
    const value = ctx.get<string>('key');
    ctx.clear('key');
    ctx.clearAll();  // New: clear all state
    const keys = ctx.stateKeys();  // New: get all keys

    return { result: result.value };
  },
});
```

### Rationale

These changes align the TypeScript SDK with SDK-Kotlin (the reference implementation) and SDK-Python:

1. **Simpler API** - `schedule()` returns `TaskHandle` which is awaitable, eliminating need for separate `scheduleAsync()`
2. **Consistent naming** - All SDKs now use the same method names
3. **Native concurrency** - Use `Promise.all()` for concurrent execution instead of a separate async variant
4. **State API** - `get()`/`set()` follows common key-value store conventions
