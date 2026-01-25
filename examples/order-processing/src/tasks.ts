/**
 * Order processing tasks.
 *
 * These tasks handle the individual steps of order processing:
 * - Validating orders
 * - Reserving inventory
 * - Charging payment
 * - Shipping orders
 * - Compensation (refunds, releasing inventory)
 */

import { task, Duration } from '@flovyn/sdk';

/**
 * Order item in an order.
 */
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

/**
 * Order to be processed.
 */
export interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  shippingAddress: string;
}

// =============================================================================
// Validation Task
// =============================================================================

export interface ValidateOrderInput {
  order: Order;
}

export interface ValidateOrderOutput {
  valid: boolean;
  totalAmount: number;
  errors: string[];
}

export const validateOrderTask = task<ValidateOrderInput, ValidateOrderOutput>({
  name: 'validate-order',
  description: 'Validate an order before processing',
  timeout: Duration.seconds(30),

  async run(ctx, input) {
    ctx.log.info('Validating order', { orderId: input.order.orderId });

    const errors: string[] = [];

    // Validate items
    if (input.order.items.length === 0) {
      errors.push('Order must have at least one item');
    }

    for (const item of input.order.items) {
      if (item.quantity <= 0) {
        errors.push(`Invalid quantity for product ${item.productId}`);
      }
      if (item.price <= 0) {
        errors.push(`Invalid price for product ${item.productId}`);
      }
    }

    // Validate shipping address
    if (!input.order.shippingAddress || input.order.shippingAddress.trim() === '') {
      errors.push('Shipping address is required');
    }

    // Calculate total
    const totalAmount = input.order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    return {
      valid: errors.length === 0,
      totalAmount,
      errors,
    };
  },
});

// =============================================================================
// Inventory Tasks
// =============================================================================

export interface ReserveInventoryInput {
  orderId: string;
  items: OrderItem[];
}

export interface ReserveInventoryOutput {
  reservationId: string;
  reserved: boolean;
  unavailableItems: string[];
}

export const reserveInventoryTask = task<ReserveInventoryInput, ReserveInventoryOutput>({
  name: 'reserve-inventory',
  description: 'Reserve inventory for an order',
  timeout: Duration.minutes(1),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(1),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Reserving inventory', { orderId: input.orderId });
    ctx.reportProgress(0.3);

    // Simulate inventory check
    const unavailableItems: string[] = [];

    // Simulate some items being unavailable (randomly for demo)
    for (const item of input.items) {
      // For demo: products starting with 'OUT' are out of stock
      if (item.productId.startsWith('OUT')) {
        unavailableItems.push(item.productId);
      }
    }

    ctx.reportProgress(0.7);

    if (unavailableItems.length > 0) {
      return {
        reservationId: '',
        reserved: false,
        unavailableItems,
      };
    }

    // Generate reservation ID
    const reservationId = `res_${input.orderId}_${Date.now()}`;

    ctx.reportProgress(1.0);

    return {
      reservationId,
      reserved: true,
      unavailableItems: [],
    };
  },
});

export interface ReleaseInventoryInput {
  reservationId: string;
}

export interface ReleaseInventoryOutput {
  released: boolean;
}

export const releaseInventoryTask = task<ReleaseInventoryInput, ReleaseInventoryOutput>({
  name: 'release-inventory',
  description: 'Release previously reserved inventory (compensation)',
  timeout: Duration.minutes(1),
  retry: {
    maxRetries: 5,
    initialDelay: Duration.seconds(1),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Releasing inventory reservation', { reservationId: input.reservationId });

    // Simulate releasing inventory
    await simulateDelay(50);

    return { released: true };
  },
});

// =============================================================================
// Payment Tasks
// =============================================================================

export interface ChargePaymentInput {
  orderId: string;
  customerId: string;
  amount: number;
}

export interface ChargePaymentOutput {
  transactionId: string;
  charged: boolean;
  failureReason?: string;
}

export const chargePaymentTask = task<ChargePaymentInput, ChargePaymentOutput>({
  name: 'charge-payment',
  description: 'Charge customer payment for an order',
  timeout: Duration.minutes(2),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(2),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Charging payment', {
      orderId: input.orderId,
      amount: input.amount,
    });
    ctx.reportProgress(0.2);

    ctx.heartbeat();

    // Simulate payment processing
    await simulateDelay(100);
    ctx.reportProgress(0.6);

    // For demo: customers with ID starting with 'FAIL' will fail
    if (input.customerId.startsWith('FAIL')) {
      return {
        transactionId: '',
        charged: false,
        failureReason: 'Payment declined by bank',
      };
    }

    const transactionId = `txn_${input.orderId}_${Date.now()}`;
    ctx.reportProgress(1.0);

    return {
      transactionId,
      charged: true,
    };
  },
});

export interface RefundPaymentInput {
  transactionId: string;
  amount: number;
  reason: string;
}

export interface RefundPaymentOutput {
  refundId: string;
  refunded: boolean;
}

export const refundPaymentTask = task<RefundPaymentInput, RefundPaymentOutput>({
  name: 'refund-payment',
  description: 'Refund a payment (compensation)',
  timeout: Duration.minutes(2),
  retry: {
    maxRetries: 5,
    initialDelay: Duration.seconds(2),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Processing refund', {
      transactionId: input.transactionId,
      amount: input.amount,
      reason: input.reason,
    });

    // Simulate refund processing
    await simulateDelay(100);

    const refundId = `ref_${input.transactionId}_${Date.now()}`;

    return {
      refundId,
      refunded: true,
    };
  },
});

// =============================================================================
// Shipping Tasks
// =============================================================================

export interface CreateShipmentInput {
  orderId: string;
  shippingAddress: string;
  items: OrderItem[];
}

export interface CreateShipmentOutput {
  trackingNumber: string;
  estimatedDelivery: Date;
}

export const createShipmentTask = task<CreateShipmentInput, CreateShipmentOutput>({
  name: 'create-shipment',
  description: 'Create shipment for an order',
  timeout: Duration.minutes(5),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(5),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Creating shipment', { orderId: input.orderId });
    ctx.reportProgress(0.25);

    ctx.heartbeat();

    // Simulate shipment creation
    await simulateDelay(200);
    ctx.reportProgress(0.75);

    const trackingNumber = `TRACK${input.orderId.toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
    const estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    ctx.reportProgress(1.0);

    return {
      trackingNumber,
      estimatedDelivery,
    };
  },
});

// =============================================================================
// Notification Tasks
// =============================================================================

export interface SendNotificationInput {
  customerId: string;
  type: 'order_confirmed' | 'order_shipped' | 'order_cancelled' | 'approval_required';
  orderId: string;
  details?: Record<string, unknown>;
}

export interface SendNotificationOutput {
  notificationId: string;
  sent: boolean;
}

export const sendNotificationTask = task<SendNotificationInput, SendNotificationOutput>({
  name: 'send-notification',
  description: 'Send notification to customer',
  timeout: Duration.seconds(30),
  retry: {
    maxRetries: 3,
    initialDelay: Duration.seconds(1),
    backoffMultiplier: 2,
  },

  async run(ctx, input) {
    ctx.log.info('Sending notification', {
      customerId: input.customerId,
      type: input.type,
      orderId: input.orderId,
    });

    // Simulate sending notification
    await simulateDelay(50);

    const notificationId = `notif_${input.orderId}_${input.type}_${Date.now()}`;

    return {
      notificationId,
      sent: true,
    };
  },
});

// =============================================================================
// Utility
// =============================================================================

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
