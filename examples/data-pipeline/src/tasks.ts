/**
 * Data pipeline tasks.
 *
 * These tasks demonstrate:
 * - Data fetching and transformation
 * - Parallel processing with batching
 * - Error handling and retry patterns
 * - Progress reporting for long-running operations
 */

import { task, Duration } from '@flovyn/sdk';

/**
 * Data record to process.
 */
export interface DataRecord {
  id: string;
  source: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Processed result.
 */
export interface ProcessedRecord {
  id: string;
  originalSource: string;
  transformedData: Record<string, unknown>;
  processedAt: Date;
  processingTimeMs: number;
}

// =============================================================================
// Data Fetching Tasks
// =============================================================================

export interface FetchDataInput {
  source: string;
  batchSize: number;
  offset?: number;
}

export interface FetchDataOutput {
  records: DataRecord[];
  hasMore: boolean;
  nextOffset: number;
}

export const fetchDataTask = task<FetchDataInput, FetchDataOutput>({
  name: 'fetch-data',
  description: 'Fetch a batch of data records from a source',
  timeout: Duration.minutes(5),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(5),
    backoffMultiplier: 2,
    maxDelay: Duration.minutes(1),
  },

  async run(ctx, input) {
    ctx.log.info('Fetching data batch', {
      source: input.source,
      batchSize: input.batchSize,
      offset: input.offset ?? 0,
    });

    ctx.reportProgress(0.2);

    // Simulate fetching data from external source
    await simulateDelay(100);

    ctx.reportProgress(0.6);

    const offset = input.offset ?? 0;

    // Generate simulated data
    const records: DataRecord[] = [];
    const totalRecords = 100; // Simulated total

    for (let i = 0; i < input.batchSize && offset + i < totalRecords; i++) {
      records.push({
        id: `record-${offset + i}`,
        source: input.source,
        data: {
          value: Math.random() * 1000,
          category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
          tags: ['tag1', 'tag2'].slice(0, Math.floor(Math.random() * 3)),
        },
        timestamp: new Date(),
      });
    }

    ctx.reportProgress(1.0);

    const nextOffset = offset + records.length;
    const hasMore = nextOffset < totalRecords;

    return {
      records,
      hasMore,
      nextOffset,
    };
  },
});

// =============================================================================
// Data Transformation Tasks
// =============================================================================

export interface TransformRecordInput {
  record: DataRecord;
  transformations: string[];
}

export interface TransformRecordOutput {
  result: ProcessedRecord;
  success: boolean;
  error?: string;
}

export const transformRecordTask = task<TransformRecordInput, TransformRecordOutput>({
  name: 'transform-record',
  description: 'Transform a single data record',
  timeout: Duration.seconds(30),
  retry: {
    maxRetries: 2,
    initialDelay: Duration.milliseconds(500),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    const startTime = Date.now();

    ctx.log.debug('Transforming record', { recordId: input.record.id });

    try {
      // Simulate transformation
      await simulateDelay(10 + Math.random() * 40);

      // Apply transformations
      const transformedData: Record<string, unknown> = { ...input.record.data };

      for (const transformation of input.transformations) {
        switch (transformation) {
          case 'uppercase':
            // Convert string values to uppercase
            for (const [key, value] of Object.entries(transformedData)) {
              if (typeof value === 'string') {
                transformedData[key] = value.toUpperCase();
              }
            }
            break;

          case 'round':
            // Round numeric values
            for (const [key, value] of Object.entries(transformedData)) {
              if (typeof value === 'number') {
                transformedData[key] = Math.round(value);
              }
            }
            break;

          case 'enrich':
            // Add metadata
            transformedData._enriched = true;
            transformedData._enrichedAt = new Date().toISOString();
            break;

          case 'validate':
            // Validate data (fail on certain conditions for demo)
            if (input.record.id.includes('fail')) {
              throw new Error('Validation failed: invalid record');
            }
            transformedData._validated = true;
            break;
        }
      }

      const processingTimeMs = Date.now() - startTime;

      return {
        result: {
          id: input.record.id,
          originalSource: input.record.source,
          transformedData,
          processedAt: new Date(),
          processingTimeMs,
        },
        success: true,
      };
    } catch (error) {
      return {
        result: {
          id: input.record.id,
          originalSource: input.record.source,
          transformedData: {},
          processedAt: new Date(),
          processingTimeMs: Date.now() - startTime,
        },
        success: false,
        error: String(error),
      };
    }
  },
});

// =============================================================================
// Batch Processing Tasks
// =============================================================================

export interface ProcessBatchInput {
  records: DataRecord[];
  transformations: string[];
  continueOnError: boolean;
}

export interface ProcessBatchOutput {
  successful: ProcessedRecord[];
  failed: Array<{ recordId: string; error: string }>;
  totalProcessed: number;
  successRate: number;
}

export const processBatchTask = task<ProcessBatchInput, ProcessBatchOutput>({
  name: 'process-batch',
  description: 'Process a batch of records with error handling',
  timeout: Duration.minutes(10),

  async run(ctx, input) {
    ctx.log.info('Processing batch', {
      recordCount: input.records.length,
      transformations: input.transformations,
    });

    const successful: ProcessedRecord[] = [];
    const failed: Array<{ recordId: string; error: string }> = [];

    for (let i = 0; i < input.records.length; i++) {
      const record = input.records[i];

      // Report progress
      ctx.reportProgress((i + 1) / input.records.length);

      // Heartbeat for long batches
      if (i % 10 === 0) {
        ctx.heartbeat();
      }

      // Check cancellation
      ctx.checkCancellation();

      try {
        // Simulate processing
        const startTime = Date.now();
        await simulateDelay(5 + Math.random() * 15);

        // Apply transformations
        const transformedData: Record<string, unknown> = { ...record.data };

        // Simulate occasional failures
        if (record.id.includes('error')) {
          throw new Error('Simulated processing error');
        }

        for (const transformation of input.transformations) {
          if (transformation === 'round' && typeof transformedData.value === 'number') {
            transformedData.value = Math.round(transformedData.value);
          }
          if (transformation === 'enrich') {
            transformedData._enriched = true;
          }
        }

        successful.push({
          id: record.id,
          originalSource: record.source,
          transformedData,
          processedAt: new Date(),
          processingTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        failed.push({
          recordId: record.id,
          error: String(error),
        });

        if (!input.continueOnError) {
          throw new Error(`Batch processing stopped at record ${record.id}: ${error}`);
        }
      }
    }

    const totalProcessed = successful.length + failed.length;
    const successRate = totalProcessed > 0 ? successful.length / totalProcessed : 0;

    return {
      successful,
      failed,
      totalProcessed,
      successRate,
    };
  },
});

// =============================================================================
// Aggregation Tasks
// =============================================================================

export interface AggregateResultsInput {
  results: ProcessedRecord[];
  groupBy: string;
}

export interface AggregateResultsOutput {
  aggregations: Record<string, AggregationResult>;
  totalRecords: number;
  processingStats: {
    minTimeMs: number;
    maxTimeMs: number;
    avgTimeMs: number;
  };
}

export interface AggregationResult {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export const aggregateResultsTask = task<AggregateResultsInput, AggregateResultsOutput>({
  name: 'aggregate-results',
  description: 'Aggregate processed results by a field',
  timeout: Duration.minutes(2),

  async run(ctx, input) {
    ctx.log.info('Aggregating results', {
      recordCount: input.results.length,
      groupBy: input.groupBy,
    });

    const groups = new Map<string, number[]>();

    // Group values
    for (const result of input.results) {
      const groupValue = String(result.transformedData[input.groupBy] ?? 'unknown');
      const value = Number(result.transformedData.value ?? 0);

      if (!groups.has(groupValue)) {
        groups.set(groupValue, []);
      }
      groups.get(groupValue)!.push(value);
    }

    // Calculate aggregations
    const aggregations: Record<string, AggregationResult> = {};

    for (const [key, values] of groups.entries()) {
      const sum = values.reduce((a, b) => a + b, 0);
      aggregations[key] = {
        count: values.length,
        sum,
        avg: values.length > 0 ? sum / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
    }

    // Calculate processing stats
    const processingTimes = input.results.map((r) => r.processingTimeMs);
    const processingStats = {
      minTimeMs: processingTimes.length > 0 ? Math.min(...processingTimes) : 0,
      maxTimeMs: processingTimes.length > 0 ? Math.max(...processingTimes) : 0,
      avgTimeMs:
        processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 0,
    };

    return {
      aggregations,
      totalRecords: input.results.length,
      processingStats,
    };
  },
});

// =============================================================================
// Output Tasks
// =============================================================================

export interface WriteResultsInput {
  results: ProcessedRecord[];
  destination: string;
  format: 'json' | 'csv';
}

export interface WriteResultsOutput {
  recordsWritten: number;
  bytesWritten: number;
  destination: string;
}

export const writeResultsTask = task<WriteResultsInput, WriteResultsOutput>({
  name: 'write-results',
  description: 'Write processed results to a destination',
  timeout: Duration.minutes(5),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(2),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Writing results', {
      recordCount: input.results.length,
      destination: input.destination,
      format: input.format,
    });

    ctx.reportProgress(0.2);

    // Simulate serialization
    let serialized: string;
    if (input.format === 'json') {
      serialized = JSON.stringify(input.results, null, 2);
    } else {
      // CSV format
      const headers = ['id', 'source', 'processedAt', 'processingTimeMs'];
      const rows = input.results.map((r) =>
        [r.id, r.originalSource, r.processedAt.toISOString(), r.processingTimeMs].join(',')
      );
      serialized = [headers.join(','), ...rows].join('\n');
    }

    ctx.reportProgress(0.6);

    // Simulate write operation
    await simulateDelay(50 + input.results.length * 2);

    ctx.reportProgress(1.0);

    return {
      recordsWritten: input.results.length,
      bytesWritten: serialized.length,
      destination: input.destination,
    };
  },
});

// =============================================================================
// Utility
// =============================================================================

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
