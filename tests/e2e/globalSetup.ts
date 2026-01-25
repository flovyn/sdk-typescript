/**
 * Global setup for E2E tests.
 *
 * This runs ONCE before all test files, not per-file.
 * Uses vitest's provide() to share harness info with test workers.
 */

import type { TestProject } from 'vitest/node';
import { getTestHarness, cleanupTestHarness, type HarnessConfig } from '../../packages/sdk/src/testing';

export async function setup(project: TestProject) {
  console.log('[Global Setup] Starting test harness...');
  try {
    const harness = await getTestHarness();

    // Provide harness info to test workers via vitest's provide()
    const config: HarnessConfig = {
      grpcHost: harness.grpcHost,
      grpcPort: harness.grpcPort,
      httpHost: harness.httpHost,
      httpPort: harness.httpPort,
      orgId: harness.orgId,
      orgSlug: harness.orgSlug,
      apiKey: harness.apiKey,
      workerToken: harness.workerToken,
    };
    project.provide('harnessConfig', config);

    console.log('[Global Setup] Test harness ready');
  } catch (error) {
    console.error('[Global Setup] Failed to start test harness:', error);
    throw error;
  }
}

export async function teardown() {
  console.log('[Global Teardown] Cleaning up test harness...');
  await cleanupTestHarness();
  console.log('[Global Teardown] Test harness cleaned up');
}
