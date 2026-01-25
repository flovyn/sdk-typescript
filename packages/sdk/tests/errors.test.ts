import { describe, it, expect } from 'vitest';
import {
  FlovynError,
  WorkflowSuspended,
  WorkflowCancelled,
  WorkflowFailed,
  TaskCancelled,
  TaskFailed,
  DeterminismViolation,
  PromiseTimeout,
  PromiseRejected,
  ChildWorkflowFailed,
} from '../src/errors';

describe('Errors', () => {
  describe('FlovynError', () => {
    it('creates base error with message', () => {
      const error = new FlovynError('test message');
      expect(error.message).toBe('test message');
      expect(error.name).toBe('FlovynError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('WorkflowSuspended', () => {
    it('creates suspended error with commands', () => {
      const commands = '{"type":"timer"}';
      const error = new WorkflowSuspended('waiting', commands);
      expect(error.message).toBe('waiting');
      expect(error.commands).toBe(commands);
      expect(error.name).toBe('WorkflowSuspended');
    });
  });

  describe('WorkflowCancelled', () => {
    it('creates cancelled error with reason', () => {
      const error = new WorkflowCancelled('user requested');
      expect(error.message).toBe('user requested');
      expect(error.name).toBe('WorkflowCancelled');
    });

    it('creates cancelled error with default message', () => {
      const error = new WorkflowCancelled();
      expect(error.message).toBe('Workflow was cancelled');
    });
  });

  describe('WorkflowFailed', () => {
    it('creates failed error with details', () => {
      const error = new WorkflowFailed('exec-123', 'Something went wrong');
      expect(error.workflowId).toBe('exec-123');
      expect(error.message).toContain('Something went wrong');
      expect(error.name).toBe('WorkflowFailed');
    });
  });

  describe('TaskCancelled', () => {
    it('creates cancelled task error', () => {
      const error = new TaskCancelled('task-456');
      expect(error.taskExecutionId).toBe('task-456');
      expect(error.name).toBe('TaskCancelled');
    });
  });

  describe('TaskFailed', () => {
    it('creates failed task error with retryable flag', () => {
      const error = new TaskFailed('connection failed', 'task-789', true);
      expect(error.taskExecutionId).toBe('task-789');
      expect(error.retryable).toBe(true);
      expect(error.message).toContain('connection failed');
      expect(error.name).toBe('TaskFailed');
    });

    it('creates non-retryable failed task error', () => {
      const error = new TaskFailed('invalid input', 'task-101', false);
      expect(error.retryable).toBe(false);
    });
  });

  describe('DeterminismViolation', () => {
    it('creates determinism violation error', () => {
      const error = new DeterminismViolation('unexpected operation');
      expect(error.message).toContain('unexpected operation');
      expect(error.name).toBe('DeterminismViolation');
    });
  });

  describe('PromiseTimeout', () => {
    it('creates promise timeout error', () => {
      const error = new PromiseTimeout('promise-abc', 5000);
      expect(error.promiseId).toBe('promise-abc');
      expect(error.timeoutMs).toBe(5000);
      expect(error.name).toBe('PromiseTimeout');
    });
  });

  describe('PromiseRejected', () => {
    it('creates promise rejected error', () => {
      const error = new PromiseRejected('promise-def', 'external error');
      expect(error.promiseId).toBe('promise-def');
      expect(error.message).toContain('external error');
      expect(error.name).toBe('PromiseRejected');
    });
  });

  describe('ChildWorkflowFailed', () => {
    it('creates child workflow failed error', () => {
      const error = new ChildWorkflowFailed('child-123', 'child crashed');
      expect(error.childExecutionId).toBe('child-123');
      expect(error.message).toContain('child crashed');
      expect(error.name).toBe('ChildWorkflowFailed');
    });
  });
});
