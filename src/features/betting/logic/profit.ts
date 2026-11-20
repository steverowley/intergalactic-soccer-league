// ── betting/logic/profit.ts ─────────────────────────────────────────────────
// WHY: One definition of a bettor's profit, shared by every surface that
// shows it (the Wagers ledger and its Net P&L summary; the Leaderboards
// Bankroll board reads the same rule from the `wager_leaderboard` view,
// migration 0102, which mirrors this file in SQL).
//
// THE RULE (#733)
//   Profit counts SETTLED wagers only, and is what the wager gained or lost
//   on top of the stake:
//     won   payout - stake   (10 credits at 2.50 pays 25, a profit of +15)
//     lost  -stake           (the stake is gone: -10)
//     void  0                (the stake comes back, nothing gained or lost)
//     open  no figure yet    (excluded from every total)
//   Net profit is the sum of that over settled wagers, which equals
//   sum(payout) - sum(stake) over settled wagers when a void wager carries
//   its refund as its payout. It is NOT `netCreditChange` (settlement.ts):
//   that is the credit RETURNED to the balance at settlement (+25 for the
//   win above, +stake for a void), which is what the old Net P&L summed.
//
// Pure: no React, no Supabase.

import type { WagerStatus } from '../types';

/** The fields of a wager the profit rule reads. */
export interface ProfitInput {
  status: WagerStatus;
  /** Credits staked (already deducted at placement). */
  stake: number;
  /** Credits paid back on a win; null while open, on a loss or a void. */
  payout: number | null;
}

/**
 * Profit or loss of ONE wager, in credits.
 *
 * @param wager  The wager's status, stake and payout.
 * @returns      payout - stake for a win, -stake for a loss, 0 for a void,
 *               and null for an open wager (it has no result yet).
 *
 * @example
 *   wagerProfit({ status: 'won',  stake: 10, payout: 25 })   // 15
 *   wagerProfit({ status: 'lost', stake: 10, payout: null }) // -10
 *   wagerProfit({ status: 'void', stake: 10, payout: null }) // 0
 *   wagerProfit({ status: 'open', stake: 10, payout: null }) // null
 */
export function wagerProfit(wager: ProfitInput): number | null {
  switch (wager.status) {
    case 'won':
      return (wager.payout ?? 0) - wager.stake;
    case 'lost':
      return -wager.stake;
    case 'void':
      return 0;
    case 'open':
      return null;
  }
}

/**
 * Net profit across many wagers: the sum of `wagerProfit` over the settled
 * ones. Open wagers are skipped, so placing a bet never moves the figure
 * until it settles.
 *
 * @param wagers  Any mix of wagers.
 * @returns       Net credits won (positive) or lost (negative).
 */
export function netProfit(wagers: readonly ProfitInput[]): number {
  let total = 0;
  for (const w of wagers) total += wagerProfit(w) ?? 0;
  return total;
}

/**
 * A signed credit figure for display: "+1,500", "\u221240" (a real minus
 * sign, not a hyphen) or "0".
 *
 * @param n  Credits (a profit or loss).
 * @returns  The signed label, grouped for the reader's locale.
 */
export function formatSignedCredits(n: number): string {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return `\u2212${Math.abs(n).toLocaleString()}`;
  return '0';
}
