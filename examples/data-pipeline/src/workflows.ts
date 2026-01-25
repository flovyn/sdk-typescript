/**
 * Data pipeline workflows.
 *
 * Demonstrates:
 * - Parallel task execution with fan-out/fan-in
 * - Batching and pagination
 * - Error handling strategies
 * - Progress tracking
 */

import { workflow, Duration, type WorkflowHandle } from '@flovyn/sdk';
import {
  fetchDataTask,
  transformRecordTask,
  processBatchTask,
  aggregateResultsTask,
  writeResultsTask,
  type DataRecord,
  type ProcessedRecord,
} from './tasks';

/**
 * Pipeline configuration.
 */
export interface PipelineConfig {
  source: string;
  destination: string;
  batchSize: number;
  parallelism: number;
  transformations: string[];
  continueOnError: boolean;
  outputFormat: 'json' | 'csv';
}

/**
 * Pipeline execution result.
 */
export interface PipelineResult {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  bytesWritten: number;
  processingStats: {
    minTimeMs: number;
    maxTimeMs: number;
    avgTimeMs: number;
  };
  aggregations?: Record<string, unknown>;
}

/**
 * Simple data pipeline workflow.
 *
 * Fetches data in batches, processes each batch, and writes results.
 */
export const simplePipelineWorkflow = workflow<PipelineConfig, PipelineResult>({
  name: 'simple-pipeline',
  description: 'Simple data pipeline with batch processing',
  version: '1.0.0',
  timeout: Duration.hours(4),

  handlers: {
    queries: {
      progress: (ctx) => ctx.getState<number>('progress') ?? 0,
      status: (ctx) => ctx.getState<string>('status') ?? 'pending',
      stats: (ctx) => ctx.getState<Record<string, unknown>>('stats'),
    },
  },

  async run(ctx, config) {
    ctx.log.info('Starting simple pipeline', { config });
    ctx.setState('status', 'running');
    ctx.setState('progress', 0);

    const allResults: ProcessedRecord[] = [];
    const allFailures: Array<{ recordId: string; error: string }> = [];
    let offset = 0;
    let hasMore = true;
    let batchNumber = 0;

    // Process data in batches
    while (hasMore) {
      batchNumber++;
      ctx.log.info(`Processing batch ${batchNumber}`, { offset });

      // Fetch batch
      ctx.setState('status', `fetching_batch_${batchNumber}`);
      const fetchResult = await ctx.task(fetchDataTask, {
        source: config.source,
        batchSize: config.batchSize,
        offset,
      });

      if (fetchResult.records.length === 0) {
        break;
      }

      // Process batch
      ctx.setState('status', `processing_batch_${batchNumber}`);
      const processResult = await ctx.task(processBatchTask, {
        records: fetchResult.records,
        transformations: config.transformations,
        continueOnError: config.continueOnError,
      });

      allResults.push(...processResult.successful);
      allFailures.push(...processResult.failed);

      // Update progress
      ctx.setState('stats', {
        batchesProcessed: batchNumber,
        recordsProcessed: allResults.length,
        recordsFailed: allFailures.length,
      });

      hasMore = fetchResult.hasMore;
      offset = fetchResult.nextOffset;
    }

    // Aggregate results
    ctx.setState('status', 'aggregating');
    const aggregation = await ctx.task(aggregateResultsTask, {
      results: allResults,
      groupBy: 'category',
    });

    // Write results
    ctx.setState('status', 'writing_results');
    const writeResult = await ctx.task(writeResultsTask, {
      results: allResults,
      destination: config.destination,
      format: config.outputFormat,
    });

    ctx.setState('status', 'completed');
    ctx.setState('progress', 100);

    return {
      totalRecords: allResults.length + allFailures.length,
      successfulRecords: allResults.length,
      failedRecords: allFailures.length,
      bytesWritten: writeResult.bytesWritten,
      processingStats: aggregation.processingStats,
      aggregations: aggregation.aggregations,
    };
  },
});

/**
 * Parallel data pipeline workflow.
 *
 * Demonstrates fan-out/fan-in pattern with parallel task execution.
 */
export const parallelPipelineWorkflow = workflow<PipelineConfig, PipelineResult>({
  name: 'parallel-pipeline',
  description: 'Data pipeline with parallel record processing',
  version: '1.0.0',
  timeout: Duration.hours(4),

  handlers: {
    queries: {
      progress: (ctx) => ctx.getState<number>('progress') ?? 0,
      status: (ctx) => ctx.getState<string>('status') ?? 'pending',
    },
  },

  async run(ctx, config) {
    ctx.log.info('Starting parallel pipeline', { config });
    ctx.setState('status', 'running');

    const allResults: ProcessedRecord[] = [];
    const allFailures: Array<{ recordId: string; error: string }> = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch batch
      ctx.setState('status', 'fetching');
      const fetchResult = await ctx.task(fetchDataTask, {
        source: config.source,
        batchSize: config.batchSize,
        offset,
      });

      if (fetchResult.records.length === 0) {
        break;
      }

      // Process records in parallel (fan-out)
      ctx.setState('status', 'processing_parallel');
      const records = fetchResult.records;

      // Split into chunks based on parallelism
      const chunks = chunkArray(records, Math.ceil(records.length / config.parallelism));

      // Schedule all chunk processing tasks
      const handles = chunks.map((chunk, i) =>
        ctx.scheduleTask(processBatchTask, {
          records: chunk,
          transformations: config.transformations,
          continueOnError: config.continueOnError,
        })
      );

      // Wait for all to complete (fan-in)
      for (const handle of handles) {
        const result = await handle.result();
        allResults.push(...result.successful);
        allFailures.push(...result.failed);
      }

      hasMore = fetchResult.hasMore;
      offset = fetchResult.nextOffset;
    }

    // Aggregate and write (same as simple pipeline)
    ctx.setState('status', 'aggregating');
    const aggregation = await ctx.task(aggregateResultsTask, {
      results: allResults,
      groupBy: 'category',
    });

    ctx.setState('status', 'writing_results');
    const writeResult = await ctx.task(writeResultsTask, {
      results: allResults,
      destination: config.destination,
      format: config.outputFormat,
    });

    ctx.setState('status', 'completed');

    return {
      totalRecords: allResults.length + allFailures.length,
      successfulRecords: allResults.length,
      failedRecords: allFailures.length,
      bytesWritten: writeResult.bytesWritten,
      processingStats: aggregation.processingStats,
      aggregations: aggregation.aggregations,
    };
  },
});

/**
 * Distributed pipeline using child workflows.
 *
 * Each batch is processed by a child workflow for better isolation.
 */
export const distributedPipelineWorkflow = workflow<PipelineConfig, PipelineResult>({
  name: 'distributed-pipeline',
  description: 'Distributed pipeline using child workflows for each batch',
  version: '1.0.0',
  timeout: Duration.hours(8),

  async run(ctx, config) {
    ctx.log.info('Starting distributed pipeline', { config });

    const allResults: ProcessedRecord[] = [];
    const allFailures: Array<{ recordId: string; error: string }> = [];
    let offset = 0;
    let hasMore = true;
    let batchNumber = 0;

    // Launch child workflows for each batch
    const childHandles: Array<{
      handle: WorkflowHandle<BatchProcessorOutput>;
      batchNumber: number;
    }> = [];

    // First, determine all batches and schedule child workflows
    while (hasMore) {
      batchNumber++;

      // Fetch to determine batch bounds
      const fetchResult = await ctx.task(fetchDataTask, {
        source: config.source,
        batchSize: config.batchSize,
        offset,
      });

      if (fetchResult.records.length === 0) {
        break;
      }

      // Schedule child workflow for this batch
      const handle = ctx.scheduleWorkflow(batchProcessorWorkflow, {
        source: config.source,
        batchSize: config.batchSize,
        offset,
        transformations: config.transformations,
        continueOnError: config.continueOnError,
      });

      childHandles.push({ handle, batchNumber });

      hasMore = fetchResult.hasMore;
      offset = fetchResult.nextOffset;
    }

    ctx.log.info(`Scheduled ${childHandles.length} batch processors`);

    // Collect results from all child workflows
    for (const { handle, batchNumber } of childHandles) {
      ctx.log.info(`Waiting for batch ${batchNumber}`);
      const result = await handle.result();
      allResults.push(...result.successful);
      allFailures.push(...result.failed);
    }

    // Aggregate and write
    const aggregation = await ctx.task(aggregateResultsTask, {
      results: allResults,
      groupBy: 'category',
    });

    const writeResult = await ctx.task(writeResultsTask, {
      results: allResults,
      destination: config.destination,
      format: config.outputFormat,
    });

    return {
      totalRecords: allResults.length + allFailures.length,
      successfulRecords: allResults.length,
      failedRecords: allFailures.length,
      bytesWritten: writeResult.bytesWritten,
      processingStats: aggregation.processingStats,
      aggregations: aggregation.aggregations,
    };
  },
});

/**
 * Batch processor child workflow.
 */
interface BatchProcessorInput {
  source: string;
  batchSize: number;
  offset: number;
  transformations: string[];
  continueOnError: boolean;
}

interface BatchProcessorOutput {
  successful: ProcessedRecord[];
  failed: Array<{ recordId: string; error: string }>;
}

export const batchProcessorWorkflow = workflow<BatchProcessorInput, BatchProcessorOutput>({
  name: 'batch-processor',
  description: 'Process a single batch of records',
  version: '1.0.0',

  async run(ctx, input) {
    ctx.log.info('Processing batch', { offset: input.offset });

    // Fetch the batch
    const fetchResult = await ctx.task(fetchDataTask, {
      source: input.source,
      batchSize: input.batchSize,
      offset: input.offset,
    });

    // Process the batch
    const processResult = await ctx.task(processBatchTask, {
      records: fetchResult.records,
      transformations: input.transformations,
      continueOnError: input.continueOnError,
    });

    return {
      successful: processResult.successful,
      failed: processResult.failed,
    };
  },
});

/**
 * Error recovery pipeline workflow.
 *
 * Demonstrates retry and error handling patterns.
 */
export const errorRecoveryPipelineWorkflow = workflow({
  name: 'error-recovery-pipeline',
  description: 'Pipeline with comprehensive error handling',
  version: '1.0.0',

  async run(
    ctx,
    input: {
      source: string;
      destination: string;
      maxRetries: number;
    }
  ) {
    ctx.log.info('Starting error recovery pipeline');

    let attempt = 0;
    let lastError: string | null = null;

    while (attempt < input.maxRetries) {
      attempt++;
      ctx.log.info(`Pipeline attempt ${attempt}/${input.maxRetries}`);

      try {
        // Run the pipeline
        const result = await ctx.workflow(simplePipelineWorkflow, {
          source: input.source,
          destination: input.destination,
          batchSize: 20,
          parallelism: 4,
          transformations: ['round', 'enrich'],
          continueOnError: false, // Fail fast
          outputFormat: 'json',
        });

        // Success!
        return {
          success: true,
          attempts: attempt,
          result,
        };
      } catch (error) {
        lastError = String(error);
        ctx.log.warn(`Attempt ${attempt} failed`, { error: lastError });

        if (attempt < input.maxRetries) {
          // Exponential backoff
          const backoffMs = Math.pow(2, attempt) * 1000;
          ctx.log.info(`Waiting ${backoffMs}ms before retry`);
          await ctx.sleep(Duration.milliseconds(backoffMs));
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      attempts: attempt,
      lastError,
    };
  },
});

// =============================================================================
// Utility Functions
// =============================================================================

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
