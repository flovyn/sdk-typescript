/**
 * E2E test setup.
 *
 * This file is loaded before all E2E tests and manages the test harness lifecycle.
 */

import { beforeAll, afterAll } from 'vitest';
import { getTestHarness, cleanupTestHarness } from '@flovyn/sdk/testing';

/**
 * Global test harness reference.
 */
let harnessStarted = false;

beforeAll(async () => {
  console.log('[E2E Setup] Starting test harness...');

  try {
    // Get or start the global test harness
    await getTestHarness();
    harnessStarted = true;
    console.log('[E2E Setup] Test harness ready');
  } catch (error) {
    console.error('[E2E Setup] Failed to start test harness:', error);
    throw error;
  }
}, 120000); // 2 minute timeout for container startup

afterAll(async () => {
  if (harnessStarted) {
    console.log('[E2E Setup] Cleaning up test harness...');
    await cleanupTestHarness();
    console.log('[E2E Setup] Test harness cleaned up');
  }
}, 30000);
