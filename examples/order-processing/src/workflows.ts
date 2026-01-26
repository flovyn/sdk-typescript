/**
 * Order processing workflows.
 *
 * Demonstrates:
 * - Multi-step workflow with external promise for approval
 * - Compensation/saga pattern for handling failures
 * - State management and queries
 */

import { workflow, Duration } from '@flovyn/sdk';
import {
  type Order,
  validateOrderTask,
  reserveInventoryTask,
  releaseInventoryTask,
  chargePaymentTask,
  refundPaymentTask,
  createShipmentTask,
  sendNotificationTask,
} from './tasks';

/**
 * Order status at various stages.
 */
export type OrderStatus =
  | 'pending'
  | 'validating'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'reserving_inventory'
  | 'charging_payment'
  | 'creating_shipment'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'cancelled';

/**
 * Compensation state tracking what needs to be undone.
 */
interface CompensationState {
  inventoryReserved: boolean;
  reservationId?: string;
  paymentCharged: boolean;
  transactionId?: string;
  amount?: number;
}

/**
 * Input for the order processing workflow.
 */
export interface ProcessOrderInput {
  order: Order;
  requireApproval: boolean;
  approvalTimeoutMinutes?: number;
}

/**
 * Output from the order processing workflow.
 */
export interface ProcessOrderOutput {
  orderId: string;
  status: OrderStatus;
  trackingNumber?: string | undefined;
  estimatedDelivery?: Date | undefined;
  failureReason?: string | undefined;
  compensationApplied: boolean;
}

/**
 * Approval decision from external promise.
 */
interface ApprovalDecision {
  approved: boolean;
  approvedBy?: string;
  reason?: string;
}

/**
 * Order processing workflow with approval and compensation.
 *
 * This workflow demonstrates:
 * 1. Multi-step processing with validation, inventory, payment, and shipping
 * 2. External promise for manager approval on high-value orders
 * 3. Compensation/saga pattern - if any step fails, previous steps are undone
 * 4. State management with queryable status
 */
export const processOrderWorkflow = workflow<ProcessOrderInput, ProcessOrderOutput>({
  name: 'process-order',
  description: 'Process an order with approval and compensation support',
  version: '1.0.0',
  timeout: Duration.hours(24),

  handlers: {
    queries: {
      status: (ctx) => ctx.get<OrderStatus>('status') ?? 'pending',
      compensation: (ctx) => ctx.get<CompensationState>('compensation'),
    },
    signals: {
      cancel: (ctx, payload?: { reason?: string }) => {
        ctx.set('cancelRequested', true);
        ctx.set('cancelReason', payload?.reason ?? 'Cancelled by user');
      },
    },
  },

  async run(ctx, input) {
    const { order, requireApproval, approvalTimeoutMinutes = 60 } = input;

    ctx.log.info('Starting order processing', { orderId: order.orderId });

    // Initialize compensation state
    const compensation: CompensationState = {
      inventoryReserved: false,
      paymentCharged: false,
    };
    ctx.set('compensation', compensation);
    ctx.set('status', 'pending' as OrderStatus);

    try {
      // Step 1: Validate order
      ctx.set('status', 'validating' as OrderStatus);
      const validation = await ctx.schedule(validateOrderTask, { order });

      if (!validation.valid) {
        ctx.set('status', 'failed' as OrderStatus);
        return {
          orderId: order.orderId,
          status: 'failed' as OrderStatus,
          failureReason: `Validation failed: ${validation.errors.join(', ')}`,
          compensationApplied: false,
        };
      }

      const totalAmount = validation.totalAmount;
      ctx.log.info('Order validated', { totalAmount });

      // Step 2: Approval for high-value orders
      if (requireApproval) {
        ctx.set('status', 'awaiting_approval' as OrderStatus);

        // Notify that approval is required
        await ctx.schedule(sendNotificationTask, {
          customerId: order.customerId,
          type: 'approval_required',
          orderId: order.orderId,
          details: { totalAmount },
        });

        // Wait for external approval decision
        ctx.log.info('Waiting for approval', { orderId: order.orderId });
        let decision: ApprovalDecision;

        try {
          decision = await ctx.promise<ApprovalDecision>('approval', {
            timeout: Duration.minutes(approvalTimeoutMinutes),
          });
        } catch (error) {
          // Timeout or rejection
          ctx.set('status', 'failed' as OrderStatus);
          return {
            orderId: order.orderId,
            status: 'failed' as OrderStatus,
            failureReason: 'Approval timeout or rejected',
            compensationApplied: false,
          };
        }

        if (!decision.approved) {
          ctx.set('status', 'rejected' as OrderStatus);
          ctx.log.info('Order rejected', {
            reason: decision.reason,
            rejectedBy: decision.approvedBy,
          });
          return {
            orderId: order.orderId,
            status: 'rejected' as OrderStatus,
            failureReason: decision.reason ?? 'Order rejected by approver',
            compensationApplied: false,
          };
        }

        ctx.set('status', 'approved' as OrderStatus);
        ctx.log.info('Order approved', { approvedBy: decision.approvedBy });
      }

      // Check for cancellation before proceeding
      if (ctx.get<boolean>('cancelRequested')) {
        return {
          orderId: order.orderId,
          status: 'cancelled' as OrderStatus,
          failureReason: ctx.get<string>('cancelReason') ?? undefined,
          compensationApplied: false,
        };
      }

      // Step 3: Reserve inventory
      ctx.set('status', 'reserving_inventory' as OrderStatus);
      const inventoryResult = await ctx.schedule(reserveInventoryTask, {
        orderId: order.orderId,
        items: order.items,
      });

      if (!inventoryResult.reserved) {
        ctx.set('status', 'failed' as OrderStatus);
        return {
          orderId: order.orderId,
          status: 'failed' as OrderStatus,
          failureReason: `Items unavailable: ${inventoryResult.unavailableItems.join(', ')}`,
          compensationApplied: false,
        };
      }

      // Track for compensation
      compensation.inventoryReserved = true;
      compensation.reservationId = inventoryResult.reservationId;
      ctx.set('compensation', compensation);

      // Step 4: Charge payment
      ctx.set('status', 'charging_payment' as OrderStatus);
      const paymentResult = await ctx.schedule(chargePaymentTask, {
        orderId: order.orderId,
        customerId: order.customerId,
        amount: totalAmount,
      });

      if (!paymentResult.charged) {
        // Payment failed - compensate by releasing inventory
        ctx.set('status', 'compensating' as OrderStatus);
        ctx.log.warn('Payment failed, compensating', {
          reason: paymentResult.failureReason,
        });

        await compensate(ctx, compensation);

        ctx.set('status', 'failed' as OrderStatus);
        return {
          orderId: order.orderId,
          status: 'failed' as OrderStatus,
          failureReason: paymentResult.failureReason ?? 'Payment failed',
          compensationApplied: true,
        };
      }

      // Track for compensation
      compensation.paymentCharged = true;
      compensation.transactionId = paymentResult.transactionId;
      compensation.amount = totalAmount;
      ctx.set('compensation', compensation);

      // Check for cancellation before shipping
      if (ctx.get<boolean>('cancelRequested')) {
        ctx.set('status', 'compensating' as OrderStatus);
        await compensate(ctx, compensation);
        return {
          orderId: order.orderId,
          status: 'cancelled' as OrderStatus,
          failureReason: ctx.get<string>('cancelReason') ?? undefined,
          compensationApplied: true,
        };
      }

      // Step 5: Create shipment
      ctx.set('status', 'creating_shipment' as OrderStatus);
      let shipmentResult;

      try {
        shipmentResult = await ctx.schedule(createShipmentTask, {
          orderId: order.orderId,
          shippingAddress: order.shippingAddress,
          items: order.items,
        });
      } catch (error) {
        // Shipment failed - compensate
        ctx.set('status', 'compensating' as OrderStatus);
        ctx.log.warn('Shipment creation failed, compensating', {
          error: String(error),
        });

        await compensate(ctx, compensation);

        ctx.set('status', 'failed' as OrderStatus);
        return {
          orderId: order.orderId,
          status: 'failed' as OrderStatus,
          failureReason: 'Failed to create shipment',
          compensationApplied: true,
        };
      }

      // Step 6: Send confirmation notification
      await ctx.schedule(sendNotificationTask, {
        customerId: order.customerId,
        type: 'order_shipped',
        orderId: order.orderId,
        details: {
          trackingNumber: shipmentResult.trackingNumber,
          estimatedDelivery: shipmentResult.estimatedDelivery,
        },
      });

      ctx.set('status', 'completed' as OrderStatus);
      ctx.log.info('Order processing completed', {
        orderId: order.orderId,
        trackingNumber: shipmentResult.trackingNumber,
      });

      return {
        orderId: order.orderId,
        status: 'completed' as OrderStatus,
        trackingNumber: shipmentResult.trackingNumber,
        estimatedDelivery: shipmentResult.estimatedDelivery,
        compensationApplied: false,
      };
    } catch (error) {
      // Unexpected error - attempt compensation
      ctx.log.error('Unexpected error in order processing', {
        orderId: order.orderId,
        error: String(error),
      });

      ctx.set('status', 'compensating' as OrderStatus);
      await compensate(ctx, compensation);

      ctx.set('status', 'failed' as OrderStatus);
      return {
        orderId: order.orderId,
        status: 'failed' as OrderStatus,
        failureReason: `Unexpected error: ${String(error)}`,
        compensationApplied: true,
      };
    }
  },
});

/**
 * Compensation function to undo completed steps.
 * Executes compensation in reverse order of the original operations.
 */
async function compensate(
  ctx: Parameters<typeof processOrderWorkflow.run>[0],
  state: CompensationState
): Promise<void> {
  ctx.log.info('Starting compensation', { state });

  // Refund payment first (if charged)
  if (state.paymentCharged && state.transactionId && state.amount) {
    try {
      await ctx.schedule(refundPaymentTask, {
        transactionId: state.transactionId,
        amount: state.amount,
        reason: 'Order cancelled or failed',
      });
      ctx.log.info('Payment refunded');
    } catch (error) {
      ctx.log.error('Failed to refund payment', { error: String(error) });
      // Continue with other compensations
    }
  }

  // Release inventory (if reserved)
  if (state.inventoryReserved && state.reservationId) {
    try {
      await ctx.schedule(releaseInventoryTask, {
        reservationId: state.reservationId,
      });
      ctx.log.info('Inventory released');
    } catch (error) {
      ctx.log.error('Failed to release inventory', { error: String(error) });
      // Log but don't fail - compensation should be best-effort
    }
  }

  ctx.log.info('Compensation completed');
}

/**
 * Simple order workflow for quick processing without approval.
 */
export const quickOrderWorkflow = workflow({
  name: 'quick-order',
  description: 'Process a simple order without approval',
  version: '1.0.0',

  async run(ctx, input: { order: Order }) {
    // Delegate to the main workflow without approval
    return ctx.scheduleWorkflow(processOrderWorkflow, {
      order: input.order,
      requireApproval: false,
    });
  },
});
