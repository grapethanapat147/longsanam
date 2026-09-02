/**
 * Venue integration adapters.
 *
 * The orchestrator never talks to a venue directly. It asks a `VenueAdapter`
 * whether a court is free, to hold it, and to confirm it. The MVP ships one
 * implementation — the Partner Portal, where availability lives in our own
 * database and venue staff respond in our own inbox — but the seam is what
 * lets Calendar Sync and a direct Court API arrive later without the booking
 * orchestration changing shape.
 *
 * The three planned implementations:
 *
 *  - `PartnerPortalAdapter` (shipped). Source of truth is `court_availability`
 *    plus `bookings` in our database. Confirmation is either automatic
 *    (`venues.auto_confirm_bookings`) or a human in the partner inbox.
 *
 *  - `CalendarSyncAdapter` (planned). Venues that already run on Google
 *    Calendar. Availability is a two-way sync: we mirror their calendar into
 *    `court_availability` as `blackout` rows on a schedule, and write our
 *    confirmed bookings back as events. Holds stay local because a calendar
 *    has no concept of a short-lived reservation.
 *
 *  - `CourtApiAdapter` (planned). Venues with a real booking API. Availability
 *    and holds are delegated to them, which means `checkAvailability` becomes
 *    a network call and `hold` returns their reservation id. Our exclusion
 *    constraints still apply so a court cannot be double-sold on our side; the
 *    remote system is authoritative for its own inventory.
 */

export type CourtSlot = {
  courtId: string;
  venueId: string;
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityResult =
  | { available: true; priceThb: number }
  | { available: false; reason: string };

export type HoldResult =
  | { ok: true; holdRef: string; expiresAt: Date }
  | { ok: false; reason: string };

export type ConfirmResult =
  | { ok: true; bookingRef: string; requiresVenueApproval: boolean }
  | { ok: false; reason: string };

export type VenueIntegrationKind = 'partner_portal' | 'calendar_sync' | 'court_api';

export interface VenueAdapter {
  readonly kind: VenueIntegrationKind;

  /** Is this slot bookable right now, and what does it cost? */
  checkAvailability(slot: CourtSlot): Promise<AvailabilityResult>;

  /** Reserve the slot temporarily. Must be idempotent on `idempotencyKey`. */
  hold(slot: CourtSlot, holdMinutes: number, idempotencyKey: string): Promise<HoldResult>;

  /** Turn a hold into a booking. Must be idempotent on `idempotencyKey`. */
  confirm(holdRef: string, idempotencyKey: string): Promise<ConfirmResult>;

  /** Give the slot back. Safe to call on an already-released hold. */
  release(holdRef: string, reason: string): Promise<{ ok: boolean }>;
}

/**
 * Chooses the adapter for a venue. Today every venue is on the Partner Portal;
 * when a venue gains a calendar or an API this reads a column on `venues` and
 * returns the matching adapter, and no caller changes.
 */
export function resolveIntegrationKind(venue: {
  integration_kind?: string | null;
}): VenueIntegrationKind {
  switch (venue.integration_kind) {
    case 'calendar_sync':
    case 'court_api':
      // Not implemented yet — fall back rather than silently misbehaving.
      return 'partner_portal';
    default:
      return 'partner_portal';
  }
}
