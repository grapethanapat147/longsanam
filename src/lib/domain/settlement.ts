/**
 * What the session actually cost, and who owes what.
 *
 * Settlement is not re-billing. This computes the truth; the RPC that stores it
 * touches only participants who have not paid. Rounding always goes up and the
 * organizer absorbs the difference — a player must never be asked for more than
 * their share because of arithmetic.
 */

export type SplitMode = 'equal' | 'by_games';

export type SettlementPlayer = {
  participantId: string;
  /** Organizer-entered. Null means "not recorded", not "played none". */
  gamesPlayed: number | null;
};

export type SettlementInput = {
  courtCostThb: number;
  shuttleCostThb: number;
  splitMode: SplitMode;
  players: SettlementPlayer[];
};

export type SettlementShare = { participantId: string; amountThb: number };

export type Settlement = {
  totalThb: number;
  /** The equal-split figure, shown as the headline even in by_games. */
  perPersonThb: number;
  shares: SettlementShare[];
  organizerAbsorbsThb: number;
};

export function settleSession(input: SettlementInput): Settlement {
  const totalThb = input.courtCostThb + input.shuttleCostThb;
  const n = input.players.length;

  if (n === 0) {
    return { totalThb, perPersonThb: 0, shares: [], organizerAbsorbsThb: 0 };
  }

  const perPersonThb = Math.ceil(totalThb / n);

  const recorded = input.players.filter((p) => p.gamesPlayed !== null);
  const useGames = input.splitMode === 'by_games' && recorded.length > 0;

  let shares: SettlementShare[];

  if (!useGames) {
    shares = input.players.map((p) => ({
      participantId: p.participantId,
      amountThb: perPersonThb,
    }));
  } else {
    // A blank count is not a zero. Treat it as the average of the counts we do
    // have, so one unfilled field costs that player nothing extra and costs the
    // others nothing either.
    const averageGames =
      recorded.reduce((sum, p) => sum + (p.gamesPlayed ?? 0), 0) / recorded.length;
    const games = input.players.map((p) => p.gamesPlayed ?? averageGames);
    const totalGames = games.reduce((a, b) => a + b, 0);

    shares = input.players.map((p, i) => ({
      participantId: p.participantId,
      amountThb: Math.ceil((totalThb * games[i]) / totalGames),
    }));
  }

  const collected = shares.reduce((sum, s) => sum + s.amountThb, 0);

  return { totalThb, perPersonThb, shares, organizerAbsorbsThb: collected - totalThb };
}
