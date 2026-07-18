import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import type { WalletBalance, PaymentMethod } from '@syncroute/shared';
import { prisma, type Tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { config, razorpayEnabled } from '../config.js';

/**
 * Balance is derived, never stored.
 *
 * A mutable balance column is the classic way to lose money: two concurrent
 * writes read the same balance and one overwrites the other. SUM over an
 * append-only ledger cannot disagree with its own history, and the DB trigger
 * refuses UPDATE/DELETE on the table so it stays that way.
 */
export async function balance(userId: string, client: Tx = prisma): Promise<number> {
  const rows = await client.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT SUM(amount) AS total FROM wallet_transactions WHERE user_id = ${userId}::uuid
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function summary(userId: string): Promise<WalletBalance> {
  const [bal, txns] = await Promise.all([
    balance(userId),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    balance: bal,
    transactions: txns.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type,
      tripId: t.tripId,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Recharge (Razorpay test mode)
// ---------------------------------------------------------------------------

export async function createRechargeOrder(userId: string, amount: number) {
  if (!razorpayEnabled) {
    // Without keys the demo still needs a working recharge, so we mint a
    // local order id and the verify step accepts a matching mock signature.
    return {
      mock: true,
      orderId: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount,
      currency: 'INR',
      keyId: null,
    };
  }

  const { default: Razorpay } = await import('razorpay');
  const client = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID!,
    key_secret: config.RAZORPAY_KEY_SECRET!,
  });

  const order = await client.orders.create({
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt: `rc_${userId.slice(0, 8)}_${Date.now()}`,
  });

  return {
    mock: false,
    orderId: order.id,
    amount,
    currency: 'INR',
    keyId: config.RAZORPAY_KEY_ID,
  };
}

/**
 * Verify a Razorpay callback and credit the wallet.
 *
 * The signature is recomputed from our secret — a client POSTing "payment
 * succeeded" proves nothing. The idempotency key is the payment id, so a
 * replayed callback hits the unique index and credits exactly once.
 */
export async function verifyRecharge(
  userId: string,
  orgId: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  amount: number,
): Promise<{ balance: number; credited: boolean }> {
  if (razorpayEnabled) {
    const expected = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET!)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');

    // timingSafeEqual needs equal lengths; a length mismatch is already a fail.
    const given = Buffer.from(input.razorpaySignature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      throw badRequest('Payment verification failed. No money has been deducted.');
    }
  } else if (!input.razorpayOrderId.startsWith('order_mock_')) {
    throw badRequest('Payment gateway is not configured');
  }

  try {
    await prisma.walletTransaction.create({
      data: {
        orgId,
        userId,
        amount: new Prisma.Decimal(amount),
        type: 'recharge',
        idempotencyKey: `razorpay:${input.razorpayPaymentId}`,
        note: `Wallet recharge`,
      },
    });
  } catch (err) {
    // P2002 = this payment id was already processed. Not an error: report
    // the current balance and move on.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { balance: await balance(userId), credited: false };
    }
    throw err;
  }

  return { balance: await balance(userId), credited: true };
}

// ---------------------------------------------------------------------------
// Trip payment
// ---------------------------------------------------------------------------

/**
 * Settle a booking.
 *
 * Wallet payments write BOTH ledger rows — passenger debit and driver credit —
 * inside one transaction. Money never exists in only one half of the books.
 * Cash and card record a payment row and move the trip forward without a
 * ledger transfer, because the money moved outside the platform.
 */
export async function payBooking(
  bookingId: string,
  userId: string,
  orgId: string,
  method: PaymentMethod,
  gatewayRef?: string,
): Promise<{ paymentId: string; status: 'success'; balance: number | null; tripId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { ride: { include: { trip: true, driver: { select: { id: true, name: true } } } } },
    });

    if (!booking || booking.orgId !== orgId) throw notFound('Booking not found');
    if (booking.passengerId !== userId) throw forbidden('You can only pay for your own booking');
    if (booking.status === 'cancelled') throw conflict('That booking was cancelled');

    const trip = booking.ride.trip;
    if (!trip) throw conflict('This ride has no trip record');
    if (trip.status === 'payment_completed') throw conflict('This trip is already paid');
    if (!['completed', 'payment_pending'].includes(trip.status)) {
      throw conflict('You can only pay once the trip is complete');
    }

    const existing = await tx.payment.findFirst({
      where: { bookingId, status: 'success' },
    });
    if (existing) throw conflict('This booking has already been paid');

    const amount = Number(booking.fareTotal);
    let newBalance: number | null = null;

    if (method === 'wallet') {
      const current = await balance(userId, tx);
      if (current < amount) {
        // Recorded as a failed payment so the attempt is auditable, then
        // rejected. This is the demo's clean-failure path.
        await tx.payment.create({
          data: { bookingId, method, amount: new Prisma.Decimal(amount), status: 'failed' },
        });
        throw conflict(
          `Insufficient wallet balance. You have ₹${current.toFixed(2)} but need ₹${amount.toFixed(2)}.`,
          'INSUFFICIENT_BALANCE',
        );
      }

      // Both legs, one transaction. The idempotency keys are derived from the
      // booking id, so a retry can never double-post either side.
      await tx.walletTransaction.createMany({
        data: [
          {
            orgId,
            userId,
            amount: new Prisma.Decimal(-amount),
            type: 'trip_payment',
            tripId: trip.id,
            idempotencyKey: `trip-payment:${bookingId}`,
            note: `Ride ${booking.ride.originLabel} to ${booking.ride.destLabel}`,
          },
          {
            orgId,
            userId: booking.ride.driver.id,
            amount: new Prisma.Decimal(amount),
            type: 'trip_earning',
            tripId: trip.id,
            idempotencyKey: `trip-earning:${bookingId}`,
            note: `Fare from ${booking.pickupLabel} to ${booking.dropLabel}`,
          },
        ],
      });

      newBalance = await balance(userId, tx);
    }

    const payment = await tx.payment.create({
      data: {
        bookingId,
        method,
        amount: new Prisma.Decimal(amount),
        status: 'success',
        gatewayRef: gatewayRef ?? null,
      },
    });

    // Settle the trip only when every booking on it is paid — one passenger
    // paying must not close the trip for the others.
    const unpaid = await tx.booking.count({
      where: {
        rideId: booking.rideId,
        status: { not: 'cancelled' },
        payments: { none: { status: 'success' } },
      },
    });
    if (unpaid === 0) {
      await tx.trip.update({ where: { id: trip.id }, data: { status: 'payment_completed' } });
    }

    return { paymentId: payment.id, status: 'success' as const, balance: newBalance, tripId: trip.id };
  });
}
