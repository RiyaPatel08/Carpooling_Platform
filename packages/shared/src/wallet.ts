import { z } from 'zod';
import { ledgerTypeSchema, paymentMethodSchema, paymentStatusSchema } from './enums.js';

export const rechargeOrderSchema = z.object({
  amount: z.coerce
    .number()
    .positive('Enter an amount greater than 0')
    .min(10, 'Minimum recharge is ₹10')
    .max(50000, 'Maximum recharge is ₹50,000'),
});

/**
 * Razorpay client-callback verification. The signature is checked server-side
 * against our secret — a client claiming success is never trusted.
 */
export const rechargeVerifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const walletBalanceSchema = z.object({
  /** Derived: SUM(amount) over the ledger. Never stored. */
  balance: z.number(),
  transactions: z.array(
    z.object({
      id: z.string().uuid(),
      amount: z.number(),
      type: ledgerTypeSchema,
      tripId: z.string().uuid().nullable(),
      note: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type WalletBalance = z.infer<typeof walletBalanceSchema>;

export const payBookingSchema = z.object({
  method: paymentMethodSchema,
  /** Present for card/upi via Razorpay; ignored for wallet and cash. */
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
});
export type PayBookingInput = z.infer<typeof payBookingSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  method: paymentMethodSchema,
  amount: z.number(),
  status: paymentStatusSchema,
  gatewayRef: z.string().nullable(),
  createdAt: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;
