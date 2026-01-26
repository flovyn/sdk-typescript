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
| `scheduleTask()` | `scheduleAsync()` |
| `workflow()` | `scheduleWorkflow()` |
| `scheduleWorkflow()` | `scheduleWorkflowAsync()` |
| `getState()` | `get()` |
| `setState()` | `set()` |
| `clearState()` | `clear()` |

#### New Methods

- `clearAll()` - Clear all workflow state
- `stateKeys()` - Get all state keys

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
    // Execute task
    const result = await ctx.schedule(myTask, { value: input.value });

    // Schedule task (non-blocking)
    const handle = ctx.scheduleAsync(myTask, { value: input.value });
    const result = await handle.result();

    // Execute child workflow
    const childResult = await ctx.scheduleWorkflow(childWorkflow, {});

    // Schedule child workflow (non-blocking)
    const childHandle = ctx.scheduleWorkflowAsync(childWorkflow, {});
    const childResult = await childHandle.result();

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

1. **Shorter method names** - `schedule()` instead of `task()` is clearer about what's happening
2. **Consistent naming** - All SDKs now use the same method names
3. **Clearer semantics** - `scheduleAsync()` clearly indicates non-blocking behavior
4. **State API** - `get()`/`set()` follows common key-value store conventions
