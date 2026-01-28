/**
 * Data pipeline example entry point.
 *
 * This example demonstrates:
 * - Parallel task execution with fan-out/fan-in
 * - Batch processing with pagination
 * - Error handling and recovery patterns
 * - Progress tracking and aggregation
 *
 * To run:
 * 1. Start the Flovyn server
 * 2. Run: pnpm dev
 */

import { FlovynClient } from '@flovyn/sdk';
import {
  simplePipelineWorkflow,
  parallelPipelineWorkflow,
  distributedPipelineWorkflow,
  batchProcessorWorkflow,
  errorRecoveryPipelineWorkflow,
} from './workflows';
import {
  fetchDataTask,
  transformRecordTask,
  processBatchTask,
  aggregateResultsTask,
  writeResultsTask,
} from './tasks';

// All tasks used by the workflows
const allTasks = [
  fetchDataTask,
  transformRecordTask,
  processBatchTask,
  aggregateResultsTask,
  writeResultsTask,
];

// All workflows
const allWorkflows = [
  simplePipelineWorkflow,
  parallelPipelineWorkflow,
  distributedPipelineWorkflow,
  batchProcessorWorkflow,
  errorRecoveryPipelineWorkflow,
];

async function main() {
  // Create and configure the client
  const client = new FlovynClient({
    serverUrl: process.env.FLOVYN_SERVER_URL ?? 'http://localhost:9090',
    orgId: process.env.FLOVYN_ORG_ID ?? 'default',
    queue: process.env.FLOVYN_QUEUE ?? 'data-pipeline',
    workerToken: process.env.FLOVYN_WORKER_TOKEN,
    apiKey: process.env.FLOVYN_API_KEY,
  });

  // Register workflows and tasks
  for (const workflow of allWorkflows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.registerWorkflow(workflow as any);
  }
  for (const task of allTasks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.registerTask(task as any);
  }

  // Start the client
  await client.start();
  console.log('Data pipeline worker started');

  // Example: Run a pipeline
  if (process.env.RUN_EXAMPLE === 'true') {
    const pipelineType = process.env.PIPELINE_TYPE ?? 'simple';
    console.log(`Running ${pipelineType} pipeline example...`);

    const config = {
      source: 'demo-source',
      destination: 'output/results',
      batchSize: 20,
      parallelism: 4,
      transformations: ['round', 'enrich'],
      continueOnError: true,
      outputFormat: 'json' as const,
    };

    let handle;
    switch (pipelineType) {
      case 'parallel':
        ({ handle } = await client.startWorkflow(parallelPipelineWorkflow, config));
        break;
      case 'distributed':
        ({ handle } = await client.startWorkflow(distributedPipelineWorkflow, config));
        break;
      case 'recovery':
        ({ handle } = await client.startWorkflow(errorRecoveryPipelineWorkflow, {
          source: config.source,
          destination: config.destination,
          maxRetries: 3,
        }));
        break;
      default:
        ({ handle } = await client.startWorkflow(simplePipelineWorkflow, config));
    }

    console.log(`Started pipeline workflow: ${handle.workflowId}`);

    // Wait for result
    try {
      const result = await handle.result();
      console.log('Pipeline completed:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Pipeline failed:', error);
    }
  }

  // Handle shutdown signals
  const shutdown = async () => {
    console.log('Shutting down...');
    await client.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process running
  console.log('Worker is running. Press Ctrl+C to stop.');
}

main().catch(console.error);
