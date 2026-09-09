import { describe, expect, it } from 'vitest';
import { settleSession, type SettlementInput } from '@/lib/domain/settlement';

const base: SettlementInput = {
  courtCostThb: 616,
  shuttleCostThb: 540,
  splitMode: 'equal',
  players: [
    { participantId: 'a', gamesPlayed: null },
    { participantId: 'b', gamesPlayed: null },
    { participantId: 'c', gamesPlayed: null },
  ],
};

describe('settleSession — equal', () => {
  it('splits court and shuttles across everyone and rounds up', () => {
    // 1156 / 3 = 385.33 -> 386
    const result = settleSession(base);
    expect(result.totalThb).toBe(1156);
    expect(result.perPersonThb).toBe(386);
    expect(result.shares.map((s) => s.amountThb)).toEqual([386, 386, 386]);
  });

  it('leaves the rounding with the organizer, never the players', () => {
    const result = settleSession(base);
    const collected = result.shares.reduce((n, s) => n + s.amountThb, 0);
    expect(collected).toBeGreaterThanOrEqual(result.totalThb);
    expect(result.organizerAbsorbsThb).toBe(collected - result.totalThb);
  });

  it('returns zero for a session nobody played', () => {
    const result = settleSession({ ...base, players: [] });
    expect(result.perPersonThb).toBe(0);
    expect(result.shares).toEqual([]);
  });
});

describe('settleSession — by_games', () => {
  const byGames: SettlementInput = {
    ...base,
    splitMode: 'by_games',
    players: [
      { participantId: 'a', gamesPlayed: 8 },
      { participantId: 'b', gamesPlayed: 4 },
      { participantId: 'c', gamesPlayed: 4 },
    ],
  };

  it('charges in proportion to games played', () => {
    const result = settleSession(byGames);
    // 1156 over 16 games = 72.25/game -> a:578, b:289, c:289 (rounded up)
    expect(result.shares.map((s) => s.amountThb)).toEqual([578, 289, 289]);
  });

  it('falls back to the group average for a missing count', () => {
    const result = settleSession({
      ...byGames,
      players: [
        { participantId: 'a', gamesPlayed: 8 },
        { participantId: 'b', gamesPlayed: 4 },
        { participantId: 'c', gamesPlayed: null },
      ],
    });
    // c is treated as 6, the average of 8 and 4; a blank field costs nobody extra
    expect(result.shares[2].amountThb).toBeGreaterThan(result.shares[1].amountThb);
    expect(result.shares[2].amountThb).toBeLessThan(result.shares[0].amountThb);
  });

  it('falls back to an equal split when nobody has a count', () => {
    const result = settleSession({ ...byGames, players: base.players });
    expect(result.shares.map((s) => s.amountThb)).toEqual([386, 386, 386]);
  });
});
