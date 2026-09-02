/**
 * Fallback selection.
 *
 * The organizer ranks the courts they are willing to play on. The orchestrator
 * walks that list in order. The single rule that must never bend: a court the
 * organizer did not approve is never booked, no matter how many options above
 * it have failed.
 */

export type VenuePreference = {
  id: string;
  venueId: string;
  courtId: string;
  priority: number;
  approved: boolean;
};

export type AttemptOutcome =
  | 'confirmed'
  | 'rejected'
  | 'unavailable'
  | 'hold_failed'
  | 'expired'
  | 'error';

export type BookingAttempt = {
  courtId: string;
  outcome: AttemptOutcome;
};

export type FallbackSelection =
  | { kind: 'attempt'; preference: VenuePreference; attemptNo: number; remainingOptions: number }
  | { kind: 'already_booked'; preference: VenuePreference }
  | { kind: 'exhausted'; triedCourtIds: string[]; unapprovedSkipped: number };

/** Outcomes that permanently retire a court from this session's attempt list. */
const TERMINAL_OUTCOMES: readonly AttemptOutcome[] = [
  'rejected',
  'unavailable',
  'hold_failed',
  'expired',
  'error',
];

export function approvedPreferences(preferences: readonly VenuePreference[]): VenuePreference[] {
  return preferences
    .filter((p) => p.approved)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.courtId.localeCompare(b.courtId));
}

/**
 * Picks the next court to try, or reports that the approved list is spent.
 * Attempts are keyed by court so a retry of the whole orchestration does not
 * re-try a court that already refused.
 */
export function selectFallbackCourt(
  preferences: readonly VenuePreference[],
  attempts: readonly BookingAttempt[] = [],
): FallbackSelection {
  const confirmed = attempts.find((a) => a.outcome === 'confirmed');
  if (confirmed) {
    const preference = preferences.find((p) => p.courtId === confirmed.courtId);
    if (preference) {
      return { kind: 'already_booked', preference };
    }
  }

  const ordered = approvedPreferences(preferences);
  const unapprovedSkipped = preferences.length - ordered.length;

  const exhaustedCourtIds = new Set(
    attempts.filter((a) => TERMINAL_OUTCOMES.includes(a.outcome)).map((a) => a.courtId),
  );

  const remaining = ordered.filter((p) => !exhaustedCourtIds.has(p.courtId));

  if (remaining.length === 0) {
    return {
      kind: 'exhausted',
      triedCourtIds: [...exhaustedCourtIds],
      unapprovedSkipped,
    };
  }

  return {
    kind: 'attempt',
    preference: remaining[0],
    attemptNo: exhaustedCourtIds.size + 1,
    remainingOptions: remaining.length - 1,
  };
}

/** The whole ordered plan, useful for showing the organizer what will happen. */
export function fallbackPlan(preferences: readonly VenuePreference[]): VenuePreference[] {
  return approvedPreferences(preferences);
}
