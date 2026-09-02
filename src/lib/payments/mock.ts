import type {
  ChargeIntent,
  ChargeResult,
  PaymentProvider,
  PaymentStatusResult,
  RefundIntent,
  RefundResult,
} from './types';

/**
 * The local/demo provider.
 *
 * It moves no money. It exists so the whole booking flow can be exercised end
 * to end, including the paths people usually skip: a declined card, a charge
 * that stays pending, a refund that fails. `MOCK_PAYMENT_FAILURE_RATE` drives
 * deliberate failures so those states are reachable in a demo.
 *
 * State lives in memory, keyed by idempotency key, which is enough for a
 * single-process dev server. The database — not this map — remains the record
 * of what was actually paid.
 */

type MockRecord = {
  providerRef: string;
  status: PaymentStatusResult['status'];
  amountThb: number;
  idempotencyKey: string;
};

const charges = new Map<string, MockRecord>();
const byRef = new Map<string, MockRecord>();
const refunds = new Map<string, RefundResult>();

/**
 * Deterministic pseudo-random in [0,1) derived from the idempotency key, so a
 * retry of the same charge behaves identically instead of flipping outcome.
 */
function stableUnitInterval(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function failureRate(): number {
  const raw = Number(process.env.MOCK_PAYMENT_FAILURE_RATE ?? '0');
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

function reference(prefix: string, idempotencyKey: string): string {
  return `${prefix}_${stableUnitInterval(idempotencyKey).toString(36).slice(2, 8)}${idempotencyKey
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-10)}`;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly isMock = true;
  readonly displayLabel = 'โหมดทดลอง — ไม่มีการตัดเงินจริง';

  async createCharge(intent: ChargeIntent): Promise<ChargeResult> {
    const existing = charges.get(intent.idempotencyKey);
    if (existing) {
      return existing.status === 'succeeded'
        ? { status: 'succeeded', providerRef: existing.providerRef, isMock: true }
        : existing.status === 'failed'
          ? {
              status: 'failed',
              providerRef: existing.providerRef,
              failureCode: 'mock_declined',
              failureMessage: 'การชำระเงินจำลองถูกปฏิเสธ (โหมดทดลอง)',
              isMock: true,
            }
          : { status: 'pending', providerRef: existing.providerRef, isMock: true };
    }

    if (intent.amountThb <= 0) {
      return {
        status: 'failed',
        failureCode: 'invalid_amount',
        failureMessage: 'จำนวนเงินไม่ถูกต้อง',
        isMock: true,
      };
    }

    const providerRef = reference('mockch', intent.idempotencyKey);
    const shouldFail = stableUnitInterval(`fail:${intent.idempotencyKey}`) < failureRate();

    const record: MockRecord = {
      providerRef,
      status: shouldFail ? 'failed' : 'succeeded',
      amountThb: intent.amountThb,
      idempotencyKey: intent.idempotencyKey,
    };
    charges.set(intent.idempotencyKey, record);
    byRef.set(providerRef, record);

    if (shouldFail) {
      return {
        status: 'failed',
        providerRef,
        failureCode: 'mock_declined',
        failureMessage: 'การชำระเงินจำลองถูกปฏิเสธ (โหมดทดลอง)',
        isMock: true,
      };
    }

    return { status: 'succeeded', providerRef, isMock: true };
  }

  async capture(providerRef: string): Promise<ChargeResult> {
    const record = byRef.get(providerRef);
    if (!record) {
      return {
        status: 'failed',
        failureCode: 'not_found',
        failureMessage: 'ไม่พบรายการชำระเงิน',
        isMock: true,
      };
    }
    record.status = 'succeeded';
    return { status: 'succeeded', providerRef, isMock: true };
  }

  async cancel(providerRef: string): Promise<{ ok: boolean; reason?: string }> {
    const record = byRef.get(providerRef);
    if (!record) return { ok: false, reason: 'not_found' };
    if (record.status === 'succeeded') return { ok: false, reason: 'already_captured' };
    record.status = 'failed';
    return { ok: true };
  }

  async refund(intent: RefundIntent): Promise<RefundResult> {
    const existing = refunds.get(intent.idempotencyKey);
    if (existing) return existing;

    const record = byRef.get(intent.providerRef);
    let result: RefundResult;

    // The in-memory ledger only knows charges made by this process. A charge
    // from a previous run, or one written by the seed, is still a legitimate
    // mock charge — recognise it by its reference rather than refusing to
    // refund money the database says was collected.
    const isOwnReference = intent.providerRef.startsWith('mock');

    if (!record && !isOwnReference) {
      result = {
        status: 'failed',
        failureCode: 'not_found',
        failureMessage: 'ไม่พบรายการชำระเงินต้นทาง',
        isMock: true,
      };
    } else if (record && intent.amountThb > record.amountThb) {
      result = {
        status: 'failed',
        failureCode: 'amount_exceeds_charge',
        failureMessage: 'จำนวนเงินคืนมากกว่ายอดที่ชำระไว้',
        isMock: true,
      };
    } else {
      if (record) record.status = 'refunded';
      result = { status: 'succeeded', providerRef: reference('mockrf', intent.idempotencyKey), isMock: true };
    }

    refunds.set(intent.idempotencyKey, result);
    return result;
  }

  async getStatus(providerRef: string): Promise<PaymentStatusResult> {
    const record = byRef.get(providerRef);
    return {
      status: record?.status ?? 'failed',
      providerRef,
      isMock: true,
    };
  }
}

/** Test seam: clears the in-memory ledger. */
export function __resetMockProvider(): void {
  charges.clear();
  byRef.clear();
  refunds.clear();
}
