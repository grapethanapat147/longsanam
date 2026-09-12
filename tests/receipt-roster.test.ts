import { describe, expect, it } from 'vitest';
import { receiptRoster, type RosterSeat } from '@/lib/domain/receipt-roster';

type Seat = RosterSeat & { name: string };

const seat = (name: string, status: string, checked_in_at: string | null = null): Seat => ({
  name,
  status,
  checked_in_at,
});

const names = (seats: Seat[]) => receiptRoster(seats).map((s) => s.name);

describe('receiptRoster — nobody checked in', () => {
  const seats = [
    seat('ก้อง', 'paid_confirmed'),
    seat('แนน', 'joined_pay_later'),
    seat('บอส', 'payment_overdue'),
    seat('มีน', 'joined_pending_payment'),
  ];

  it('counts everyone still holding a seat', () => {
    expect(names(seats)).toEqual(['ก้อง', 'แนน', 'บอส']);
  });

  it('leaves out a seat that was never paid for or promised', () => {
    expect(names(seats)).not.toContain('มีน');
  });
});

describe('receiptRoster — somebody checked in', () => {
  const seats = [
    seat('ก้อง', 'paid_confirmed', '2026-09-15T12:00:00Z'),
    seat('แนน', 'paid_confirmed'),
    seat('บอส', 'joined_pay_later'),
  ];

  it('counts only the people who turned up', () => {
    expect(names(seats)).toEqual(['ก้อง']);
  });

  it('does not let a paid seat back in just because it is paid', () => {
    expect(names(seats)).not.toContain('แนน');
  });
});

describe('receiptRoster — the check-in question spans every status', () => {
  // The SQL asks "did anyone check in" across all seats, with no status filter.
  // If this rule only looked at counted statuses it would answer "nobody", and
  // the roster would widen to three people the settlement never billed.
  const seats = [
    seat('ก้อง', 'paid_confirmed'),
    seat('แนน', 'joined_pay_later'),
    seat('บอส', 'payment_overdue'),
    seat('มีน', 'no_show', '2026-09-15T12:00:00Z'),
  ];

  it('narrows to the checked-in seats even when the only check-in is not counted', () => {
    expect(names(seats)).toEqual([]);
  });
});

describe('receiptRoster — edges', () => {
  it('returns nothing for a session with no seats', () => {
    expect(receiptRoster([])).toEqual([]);
  });

  it('keeps the order it was given', () => {
    const seats = [
      seat('บอส', 'paid_confirmed'),
      seat('ก้อง', 'paid_confirmed'),
      seat('แนน', 'paid_confirmed'),
    ];
    expect(names(seats)).toEqual(['บอส', 'ก้อง', 'แนน']);
  });
});
