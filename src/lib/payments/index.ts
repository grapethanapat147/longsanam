import { MockPaymentProvider } from './mock';
import type { PaymentProvider } from './types';

export * from './types';
export { MockPaymentProvider } from './mock';

let cached: PaymentProvider | null = null;

/**
 * Resolves the configured provider.
 *
 * Unknown or missing configuration falls back to the mock rather than throwing,
 * because a misconfigured gateway should never look like a working one. The
 * fallback is loud in the server log and visible in the UI, since every mock
 * surface is labelled.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const configured = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();

  switch (configured) {
    case 'mock':
      cached = new MockPaymentProvider();
      break;

    // Reserved for a Thai gateway. Deliberately not implemented: returning a
    // half-working provider here would mean telling players a payment
    // succeeded when nothing was charged.
    case 'omise':
    case 'twoctwop':
    case 'promptpay':
      throw new Error(
        `PAYMENT_PROVIDER="${configured}" is reserved but not implemented. ` +
          'Implement the PaymentProvider interface in src/lib/payments/ before enabling it.',
      );

    default:
      console.warn(
        `[payments] Unknown PAYMENT_PROVIDER "${configured}". Falling back to the mock provider.`,
      );
      cached = new MockPaymentProvider();
  }

  return cached;
}

/** Whether the active provider moves real money. Drives the UI warning banner. */
export function isMockPaymentMode(): boolean {
  return getPaymentProvider().isMock;
}

/** Test seam. */
export function __resetPaymentProvider(): void {
  cached = null;
}
