/**
 * Payment provider abstraction.
 *
 * Longsanam never talks to a gateway directly. Everything goes through this
 * interface so that swapping the local mock for a Thai gateway (Omise, 2C2P,
 * or a bank PromptPay integration) is a matter of adding one implementation
 * and changing an environment variable — no orchestration code moves.
 *
 * Two rules every implementation must honour:
 *
 * 1. Every mutating call takes an `idempotencyKey`. Calling twice with the same
 *    key must produce one charge and return the same result.
 * 2. The provider never decides business outcomes. It reports what the money
 *    did; the database decides what that means for a session.
 */

export type PaymentProviderName = 'mock' | 'omise' | 'twoctwop' | 'promptpay';

export type ChargeIntent = {
  /** Whole Thai baht. */
  amountThb: number;
  currency: 'THB';
  /** Stable key. Retrying with the same key must not double-charge. */
  idempotencyKey: string;
  description: string;
  /** Correlation only — providers must not use these for decisions. */
  metadata: {
    sessionId: string;
    participantId: string;
    userId: string;
  };
  /** Where the provider should send the payer back to, for redirect flows. */
  returnUrl?: string;
};

export type ChargeResult =
  | {
      status: 'succeeded';
      providerRef: string;
      /** True when the provider is a local stand-in rather than real money. */
      isMock: boolean;
    }
  | {
      status: 'pending';
      providerRef: string;
      /** Redirect or QR the payer must complete. */
      nextAction?: { kind: 'redirect' | 'qr'; value: string };
      isMock: boolean;
    }
  | {
      status: 'failed';
      providerRef?: string;
      failureCode: string;
      /** Thai, safe to show a player. */
      failureMessage: string;
      isMock: boolean;
    };

export type RefundIntent = {
  /** The provider reference returned by the original charge. */
  providerRef: string;
  amountThb: number;
  idempotencyKey: string;
  reason: string;
};

export type RefundResult =
  | { status: 'succeeded'; providerRef: string; isMock: boolean }
  | { status: 'pending'; providerRef: string; isMock: boolean }
  | { status: 'failed'; failureCode: string; failureMessage: string; isMock: boolean };

export type PaymentStatusResult = {
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'expired';
  providerRef: string;
  isMock: boolean;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /**
   * True when this provider does not move real money. The UI is required to
   * label every mock payment surface, so this is not optional metadata.
   */
  readonly isMock: boolean;
  /** Shown to the payer, e.g. "โหมดทดลอง — ไม่มีการตัดเงินจริง". */
  readonly displayLabel: string;

  createCharge(intent: ChargeIntent): Promise<ChargeResult>;
  /** For providers that authorize first and capture later. */
  capture(providerRef: string, idempotencyKey: string): Promise<ChargeResult>;
  cancel(providerRef: string, idempotencyKey: string): Promise<{ ok: boolean; reason?: string }>;
  refund(intent: RefundIntent): Promise<RefundResult>;
  getStatus(providerRef: string): Promise<PaymentStatusResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
