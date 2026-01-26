/**
 * Example workflow definitions.
 *
 * Workflows orchestrate tasks and maintain durable state. They are
 * replay-safe and can survive process restarts.
 */

import { workflow, Duration } from '@flovyn/sdk';
import { greetTask, sendEmailTask, type GreetOutput } from './tasks';

/**
 * Input for the greeting workflow.
 */
export interface GreetingWorkflowInput {
  name: string;
  email?: string;
  sendEmail?: boolean;
}

/**
 * Output from the greeting workflow.
 */
export interface GreetingWorkflowOutput {
  greeting: GreetOutput;
  emailSent: boolean;
  emailMessageId?: string | undefined;
}

/**
 * A workflow that greets a user and optionally sends them an email.
 */
export const greetingWorkflow = workflow<GreetingWorkflowInput, GreetingWorkflowOutput>({
  name: 'greeting-workflow',
  description: 'Greet a user and optionally send them an email',
  version: '1.0.0',
  timeout: Duration.hours(1),

  handlers: {
    queries: {
      // Query to get the current status
      status: (ctx) => {
        return ctx.get<string>('status') ?? 'unknown';
      },
    },
    signals: {
      // Signal to request email sending
      sendEmail: (ctx, payload: { email: string }) => {
        ctx.set('pendingEmail', payload.email);
      },
    },
  },

  async run(ctx, input) {
    ctx.log.info('Starting greeting workflow', { name: input.name });

    // Set initial status
    ctx.set('status', 'processing');

    // Generate greeting using a task
    const greeting = await ctx.schedule(greetTask, {
      name: input.name,
      language: 'en',
    });

    ctx.log.info('Got greeting', { message: greeting.message });

    // Check if we should send an email
    let emailSent = false;
    let emailMessageId: string | undefined;

    if (input.sendEmail && input.email) {
      ctx.set('status', 'sending_email');

      // Send the email
      const emailResult = await ctx.schedule(sendEmailTask, {
        to: input.email,
        subject: 'Greetings!',
        body: greeting.message,
      });

      emailSent = emailResult.sent;
      emailMessageId = emailResult.messageId;
    }

    // Check for any pending email from signal
    const pendingEmail = ctx.get<string>('pendingEmail');
    if (pendingEmail && !emailSent) {
      ctx.set('status', 'sending_pending_email');

      const emailResult = await ctx.schedule(sendEmailTask, {
        to: pendingEmail,
        subject: 'Greetings!',
        body: greeting.message,
      });

      emailSent = emailResult.sent;
      emailMessageId = emailResult.messageId;
    }

    ctx.set('status', 'completed');

    return {
      greeting,
      emailSent,
      emailMessageId,
    };
  },
});

/**
 * Input for the countdown workflow.
 */
export interface CountdownInput {
  count: number;
  delaySeconds: number;
}

/**
 * Output from the countdown workflow.
 */
export interface CountdownOutput {
  completedAt: Date;
  totalSteps: number;
}

/**
 * A workflow that demonstrates durable timers.
 */
export const countdownWorkflow = workflow<CountdownInput, CountdownOutput>({
  name: 'countdown-workflow',
  description: 'Count down with durable timers between each step',
  version: '1.0.0',

  handlers: {
    queries: {
      currentCount: (ctx) => {
        return ctx.get<number>('currentCount') ?? 0;
      },
    },
  },

  async run(ctx, input) {
    ctx.log.info('Starting countdown', { from: input.count });

    for (let i = input.count; i > 0; i--) {
      // Check for cancellation
      ctx.checkCancellation();

      // Store current count in state (queryable)
      ctx.set('currentCount', i);

      ctx.log.info(`Countdown: ${i}`);

      // Use a durable timer - survives process restarts
      await ctx.sleep(Duration.seconds(input.delaySeconds));
    }

    ctx.set('currentCount', 0);
    ctx.log.info('Countdown complete!');

    return {
      completedAt: ctx.currentTime(),
      totalSteps: input.count,
    };
  },
});

/**
 * A workflow that demonstrates child workflows.
 */
export const parentWorkflow = workflow({
  name: 'parent-workflow',
  description: 'A workflow that spawns child workflows',
  version: '1.0.0',

  async run(ctx, input: { names: string[] }) {
    ctx.log.info('Starting parent workflow', { count: input.names.length });

    const results: GreetingWorkflowOutput[] = [];

    for (const name of input.names) {
      // Start child workflow and wait for result
      const result = await ctx.scheduleWorkflow(greetingWorkflow, {
        name,
        sendEmail: false,
      });

      results.push(result);
    }

    return {
      processedCount: results.length,
      greetings: results.map((r) => r.greeting.message),
    };
  },
});
