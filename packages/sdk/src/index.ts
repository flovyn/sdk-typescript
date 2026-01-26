/**
 * @flovyn/sdk - TypeScript SDK for Flovyn workflow orchestration.
 *
 * This package provides a high-level API for defining and running
 * durable workflows and tasks with Flovyn.
 *
 * @example
 * ```typescript
 * import { FlovynClient, workflow, task } from '@flovyn/sdk';
 *
 * const greetTask = task({
 *   name: 'greet',
 *   async run(ctx, input: { name: string }) {
 *     return { message: `Hello, ${input.name}!` };
 *   },
 * });
 *
 * const greetingWorkflow = workflow({
 *   name: 'greeting-workflow',
 *   async run(ctx, input: { name: string }) {
 *     const result = await ctx.schedule(greetTask, input);
 *     return result;
 *   },
 * });
 *
 * const client = new FlovynClient({
 *   serverUrl: 'http://localhost:9090',
 *   orgId: 'my-org',
 * });
 *
 * client.registerWorkflow(greetingWorkflow);
 * client.registerTask(greetTask);
 * await client.start();
 * ```
 *
 * @packageDocumentation
 */

// Core exports
export { Duration } from './duration';
export * from './errors';
export * from './types';

// Definition factories
export { workflow, type WorkflowConfig } from './workflow';
export { task, type TaskConfig } from './task';

// Client
export { FlovynClient, type FlovynClientOptions, type StartWorkflowOptions } from './client';

// Handles
export { WorkflowHandleImpl } from './handles';

// Serialization
export { serialize, deserialize, type Serializer, JsonSerializer } from './serde';

// Context implementations (internal but exported for advanced use cases)
export { WorkflowContextImpl } from './context/workflow-context';
export { TaskContextImpl, type InternalStreamEvent } from './context/task-context';
