/**
 * Basic example showing how to use the Flovyn TypeScript SDK.
 *
 * This example demonstrates:
 * - Defining tasks with typed inputs/outputs
 * - Defining workflows that orchestrate tasks
 * - Using the FlovynClient to register and run workflows
 * - Querying workflow state
 */

import { FlovynClient } from '@flovyn/sdk';
import { greetTask, sendEmailTask } from './tasks';
import { greetingWorkflow, countdownWorkflow, parentWorkflow } from './workflows';

async function main() {
  console.log('Flovyn TypeScript SDK - Basic Example');
  console.log('=====================================\n');

  // Create the Flovyn client
  const client = new FlovynClient({
    serverUrl: process.env.FLOVYN_SERVER_URL ?? 'http://localhost:9090',
    orgId: process.env.FLOVYN_ORG_ID ?? 'demo-org',
    queue: 'default',
  });

  // Register workflows and tasks
  console.log('Registering workflows and tasks...');
  client.registerWorkflow(greetingWorkflow);
  client.registerWorkflow(countdownWorkflow);
  client.registerWorkflow(parentWorkflow);
  client.registerTask(greetTask);
  client.registerTask(sendEmailTask);

  // Start the client (begins processing)
  console.log('Starting client...');
  await client.start();
  console.log('Client started!\n');

  try {
    // Example 1: Start a simple greeting workflow
    console.log('--- Example 1: Simple Greeting ---');
    const { handle: handle1 } = await client.startWorkflow(greetingWorkflow, {
      name: 'World',
      sendEmail: false,
    });
    console.log(`Started workflow: ${handle1.workflowId}`);

    // Wait for the result
    const result1 = await handle1.result();
    console.log('Result:', result1.greeting.message);
    console.log();

    // Example 2: Greeting with email
    console.log('--- Example 2: Greeting with Email ---');
    const { handle: handle2 } = await client.startWorkflow(greetingWorkflow, {
      name: 'Alice',
      email: 'alice@example.com',
      sendEmail: true,
    });
    console.log(`Started workflow: ${handle2.workflowId}`);

    const result2 = await handle2.result();
    console.log('Result:', result2.greeting.message);
    console.log('Email sent:', result2.emailSent);
    console.log('Email ID:', result2.emailMessageId);
    console.log();

    // Example 3: Parent workflow with multiple children
    console.log('--- Example 3: Parent Workflow ---');
    const { handle: handle3 } = await client.startWorkflow(parentWorkflow, {
      names: ['Bob', 'Charlie', 'Diana'],
    });
    console.log(`Started workflow: ${handle3.workflowId}`);

    const result3 = await handle3.result();
    console.log('Processed:', result3.processedCount, 'greetings');
    console.log('Greetings:', result3.greetings);
    console.log();

    console.log('All examples completed successfully!');
  } finally {
    // Stop the client gracefully
    console.log('\nStopping client...');
    await client.stop();
    console.log('Client stopped.');
  }
}

// Run the main function
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
