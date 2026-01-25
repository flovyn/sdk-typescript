/**
 * Example task definitions.
 *
 * Tasks are the building blocks of workflows. They perform the actual
 * work like calling APIs, processing data, or interacting with external
 * systems.
 */

import { task, Duration } from '@flovyn/sdk';

/**
 * Input for the greet task.
 */
export interface GreetInput {
  name: string;
  language?: 'en' | 'es' | 'fr';
}

/**
 * Output from the greet task.
 */
export interface GreetOutput {
  message: string;
  timestamp: Date;
}

/**
 * A simple task that generates a greeting message.
 */
export const greetTask = task<GreetInput, GreetOutput>({
  name: 'greet',
  description: 'Generate a personalized greeting message',
  timeout: Duration.seconds(30),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(1),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Generating greeting', { name: input.name });

    // Report progress
    ctx.reportProgress(0.5);

    // Generate greeting based on language
    let greeting: string;
    switch (input.language ?? 'en') {
      case 'es':
        greeting = `¡Hola, ${input.name}!`;
        break;
      case 'fr':
        greeting = `Bonjour, ${input.name}!`;
        break;
      default:
        greeting = `Hello, ${input.name}!`;
    }

    ctx.reportProgress(1.0);

    return {
      message: greeting,
      timestamp: new Date(),
    };
  },
});

/**
 * Input for the send email task.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

/**
 * Output from the send email task.
 */
export interface SendEmailOutput {
  messageId: string;
  sent: boolean;
}

/**
 * A task that simulates sending an email.
 */
export const sendEmailTask = task<SendEmailInput, SendEmailOutput>({
  name: 'send-email',
  description: 'Send an email to a recipient',
  timeout: Duration.minutes(1),
  retry: {
    maxRetries: 5,
    initialDelay: Duration.seconds(2),
    maxDelay: Duration.minutes(1),
    backoffMultiplier: 2,
  },

  hooks: {
    onStart: async (ctx, input) => {
      ctx.log.info('Starting to send email', { to: input.to });
    },
    onSuccess: async (ctx, input, output) => {
      ctx.log.info('Email sent successfully', {
        to: input.to,
        messageId: output.messageId,
      });
    },
    onFailure: async (ctx, input, error) => {
      ctx.log.error('Failed to send email', {
        to: input.to,
        error: error.message,
      });
    },
  },

  async run(ctx, input) {
    // Check for cancellation periodically
    ctx.checkCancellation();

    // Simulate email sending
    ctx.reportProgress(0.25);
    ctx.log.debug('Preparing email', { subject: input.subject });

    // Send heartbeat for long-running operations
    ctx.heartbeat();
    ctx.reportProgress(0.5);

    // Simulate network call
    await simulateDelay(100);

    ctx.reportProgress(0.75);

    // Generate a fake message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    ctx.reportProgress(1.0);

    return {
      messageId,
      sent: true,
    };
  },
});

/**
 * Utility to simulate async delay.
 */
function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
