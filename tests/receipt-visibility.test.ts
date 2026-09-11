import { describe, expect, it } from 'vitest';
import {
  canSeeReceiptNames,
  isReceiptOrganizer,
  type ReceiptViewer,
} from '@/lib/domain/receipt-visibility';

const ORGANIZER = '11111111-1111-1111-1111-111111111001';
const PLAYER = '11111111-1111-1111-1111-111111111002';
const OUTSIDER = '11111111-1111-1111-1111-111111111007';

const viewer = (over: Partial<ReceiptViewer> = {}): ReceiptViewer => ({
  viewerId: OUTSIDER,
  organizerId: ORGANIZER,
  isParticipant: false,
  ...over,
});

describe('canSeeReceiptNames', () => {
  it('shows names to the organizer', () => {
    expect(canSeeReceiptNames(viewer({ viewerId: ORGANIZER }))).toBe(true);
  });

  it('shows names to a player in the session', () => {
    expect(canSeeReceiptNames(viewer({ viewerId: PLAYER, isParticipant: true }))).toBe(true);
  });

  it('hides names from a signed-in stranger', () => {
    expect(canSeeReceiptNames(viewer({ viewerId: OUTSIDER }))).toBe(false);
  });

  it('hides names from a signed-out visitor', () => {
    expect(canSeeReceiptNames(viewer({ viewerId: null }))).toBe(false);
  });

  it('hides names from an empty viewer id even when the organizer id is also empty', () => {
    // Not hypothetical bookkeeping: `'' === ''` is true, so a viewer with no id
    // would be handed the organizer's view if the emptiness were not checked
    // first.
    expect(canSeeReceiptNames({ viewerId: '', organizerId: '', isParticipant: false })).toBe(false);
  });

  it('does not let the participant flag override a missing viewer', () => {
    expect(canSeeReceiptNames(viewer({ viewerId: null, isParticipant: true }))).toBe(false);
  });
});

describe('isReceiptOrganizer', () => {
  it('matches the organizer', () => {
    expect(isReceiptOrganizer(ORGANIZER, ORGANIZER)).toBe(true);
  });

  it('rejects a different signed-in user', () => {
    expect(isReceiptOrganizer(PLAYER, ORGANIZER)).toBe(false);
  });

  it('rejects a signed-out visitor', () => {
    expect(isReceiptOrganizer(null, ORGANIZER)).toBe(false);
  });

  it('rejects an empty viewer id against an empty organizer id', () => {
    expect(isReceiptOrganizer('', '')).toBe(false);
  });
});
