/**
 * Global setup for E2E tests.
 *
 * This runs ONCE before all test files, not per-file.
 */

import { getTestHarness, cleanupTestHarness } from '../../packages/sdk/src/testing';

export async function setup() {
  console.log('[Global Setup] Starting test harness...');
  try {
    const harness = await getTestHarness();
    // Export harness info for tests to use
    process.env.FLOVYN_TEST_GRPC_HOST = harness.grpcHost;
    process.env.FLOVYN_TEST_GRPC_PORT = String(harness.grpcPort);
    process.env.FLOVYN_TEST_HTTP_HOST = harness.httpHost;
    process.env.FLOVYN_TEST_HTTP_PORT = String(harness.httpPort);
    process.env.FLOVYN_TEST_ORG_ID = harness.orgId;
    process.env.FLOVYN_TEST_ORG_SLUG = harness.orgSlug;
    process.env.FLOVYN_TEST_API_KEY = harness.apiKey;
    process.env.FLOVYN_TEST_WORKER_TOKEN = harness.workerToken;
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
