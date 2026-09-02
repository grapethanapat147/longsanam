import { describe, expect, it } from 'vitest';
import {
  approvedPreferences,
  selectFallbackCourt,
  type BookingAttempt,
  type VenuePreference,
} from '@/lib/domain/fallback';

const pref = (
  courtId: string,
  priority: number,
  approved = true,
  venueId = 'venue-1',
): VenuePreference => ({ id: `pref-${courtId}`, venueId, courtId, priority, approved });

const PREFERENCES: VenuePreference[] = [
  pref('court-b', 2),
  pref('court-a', 1),
  pref('court-c', 3, false),
  pref('court-d', 4, true, 'venue-2'),
];

describe('selectFallbackCourt', () => {
  it('starts with the highest-priority approved court', () => {
    const result = selectFallbackCourt(PREFERENCES, []);
    expect(result.kind).toBe('attempt');
    if (result.kind !== 'attempt') return;
    expect(result.preference.courtId).toBe('court-a');
    expect(result.attemptNo).toBe(1);
  });

  it('moves to the next approved court after a rejection', () => {
    const attempts: BookingAttempt[] = [{ courtId: 'court-a', outcome: 'rejected' }];
    const result = selectFallbackCourt(PREFERENCES, attempts);
    expect(result.kind).toBe('attempt');
    if (result.kind !== 'attempt') return;
    expect(result.preference.courtId).toBe('court-b');
    expect(result.attemptNo).toBe(2);
  });

  it('never selects an unapproved court, even when every approved option failed', () => {
    const attempts: BookingAttempt[] = [
      { courtId: 'court-a', outcome: 'unavailable' },
      { courtId: 'court-b', outcome: 'rejected' },
      { courtId: 'court-d', outcome: 'hold_failed' },
    ];
    const result = selectFallbackCourt(PREFERENCES, attempts);
    expect(result.kind).toBe('exhausted');
    if (result.kind !== 'exhausted') return;
    expect(result.triedCourtIds).not.toContain('court-c');
    expect(result.unapprovedSkipped).toBe(1);
  });

  it('reports exhaustion when the organizer approved nothing at all', () => {
    const result = selectFallbackCourt([pref('court-x', 1, false)], []);
    expect(result.kind).toBe('exhausted');
  });

  it('crosses venues in priority order rather than staying at one venue', () => {
    const attempts: BookingAttempt[] = [
      { courtId: 'court-a', outcome: 'unavailable' },
      { courtId: 'court-b', outcome: 'unavailable' },
    ];
    const result = selectFallbackCourt(PREFERENCES, attempts);
    expect(result.kind).toBe('attempt');
    if (result.kind !== 'attempt') return;
    expect(result.preference.courtId).toBe('court-d');
    expect(result.preference.venueId).toBe('venue-2');
  });

  it('stops entirely once a court has been confirmed', () => {
    const attempts: BookingAttempt[] = [
      { courtId: 'court-a', outcome: 'unavailable' },
      { courtId: 'court-b', outcome: 'confirmed' },
    ];
    const result = selectFallbackCourt(PREFERENCES, attempts);
    expect(result.kind).toBe('already_booked');
    if (result.kind !== 'already_booked') return;
    expect(result.preference.courtId).toBe('court-b');
  });

  it('is retry-safe: repeating the same attempt list yields the same choice', () => {
    const attempts: BookingAttempt[] = [{ courtId: 'court-a', outcome: 'expired' }];
    const first = selectFallbackCourt(PREFERENCES, attempts);
    const second = selectFallbackCourt(PREFERENCES, attempts);
    expect(first).toEqual(second);
  });

  it('does not re-try a court that already errored', () => {
    const attempts: BookingAttempt[] = [{ courtId: 'court-a', outcome: 'error' }];
    const result = selectFallbackCourt(PREFERENCES, attempts);
    expect(result.kind).toBe('attempt');
    if (result.kind !== 'attempt') return;
    expect(result.preference.courtId).not.toBe('court-a');
  });

  it('counts down the options left so the organizer can be told', () => {
    const result = selectFallbackCourt(PREFERENCES, []);
    expect(result.kind).toBe('attempt');
    if (result.kind !== 'attempt') return;
    // court-a now, court-b and court-d still in reserve.
    expect(result.remainingOptions).toBe(2);
  });
});

describe('approvedPreferences', () => {
  it('sorts by priority and drops unapproved entries', () => {
    expect(approvedPreferences(PREFERENCES).map((p) => p.courtId)).toEqual([
      'court-a',
      'court-b',
      'court-d',
    ]);
  });

  it('breaks priority ties deterministically', () => {
    const tied = [pref('court-z', 1), pref('court-y', 1)];
    expect(approvedPreferences(tied).map((p) => p.courtId)).toEqual(['court-y', 'court-z']);
  });
});
