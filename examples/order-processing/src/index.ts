/**
 * Order processing example entry point.
 *
 * This example demonstrates:
 * - Multi-step order workflow
 * - External promise for manager approval
 * - Compensation/saga pattern for failure handling
 *
 * To run:
 * 1. Start the Flovyn server
 * 2. Run: pnpm dev
 */

import { FlovynClient } from '@flovyn/sdk';
import { processOrderWorkflow, quickOrderWorkflow } from './workflows';
import {
  validateOrderTask,
  reserveInventoryTask,
  releaseInventoryTask,
  chargePaymentTask,
  refundPaymentTask,
  createShipmentTask,
  sendNotificationTask,
} from './tasks';

// All tasks used by the workflows
const allTasks = [
  validateOrderTask,
  reserveInventoryTask,
  releaseInventoryTask,
  chargePaymentTask,
  refundPaymentTask,
  createShipmentTask,
  sendNotificationTask,
];

// All workflows
const allWorkflows = [processOrderWorkflow, quickOrderWorkflow];

async function main() {
  // Create and configure the client
  const client = new FlovynClient({
    serverUrl: process.env.FLOVYN_SERVER_URL ?? 'http://localhost:9090',
    orgId: process.env.FLOVYN_ORG_ID ?? 'default',
    queue: process.env.FLOVYN_QUEUE ?? 'order-processing',
    workerToken: process.env.FLOVYN_WORKER_TOKEN,
    apiKey: process.env.FLOVYN_API_KEY,
  });

  // Register workflows and tasks
  for (const workflow of allWorkflows) {
    client.registerWorkflow(workflow);
  }
  for (const task of allTasks) {
    client.registerTask(task);
  }

  // Start the client
  await client.start();
  console.log('Order processing worker started');

  // Example: Start an order workflow
  if (process.env.RUN_EXAMPLE === 'true') {
    console.log('Starting example order...');

    // Example order
    const order = {
      orderId: `ORD-${Date.now()}`,
      customerId: 'CUST-001',
      items: [
        { productId: 'PROD-A', quantity: 2, price: 29.99 },
        { productId: 'PROD-B', quantity: 1, price: 49.99 },
      ],
      shippingAddress: '123 Main St, Anytown, ST 12345',
    };

    // Start workflow without approval
    const handle = await client.startWorkflow(processOrderWorkflow, {
      order,
      requireApproval: false,
    });

    console.log(`Started order workflow: ${handle.workflowId}`);

    // Wait for result
    try {
      const result = await handle.result();
      console.log('Order completed:', result);
    } catch (error) {
      console.error('Order failed:', error);
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
