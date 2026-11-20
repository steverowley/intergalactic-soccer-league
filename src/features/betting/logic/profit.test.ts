// Tests for the bettor profit rule (#733): settled wagers only, profit is
// what was gained on top of the stake, never the credit returned.
import { describe, expect, it } from 'vitest';

import { formatSignedCredits, netProfit, wagerProfit, type ProfitInput } from './profit';
import { calculatePayout, netCreditChange } from './settlement';

const won: ProfitInput = { status: 'won', stake: 10, payout: calculatePayout(10, 2.5) };
const lost: ProfitInput = { status: 'lost', stake: 10, payout: null };
const voided: ProfitInput = { status: 'void', stake: 10, payout: null };
const open: ProfitInput = { status: 'open', stake: 10, payout: null };

describe('wagerProfit', () => {
  it('a winning 10-credit bet at 2.50 is +15, not the 25 returned', () => {
    expect(won.payout).toBe(25);
    expect(wagerProfit(won)).toBe(15);
    // The old Net P&L summed this instead: the credit returned.
    expect(netCreditChange('won', 10, 25)).toBe(25);
  });

  it('a loss is minus the stake', () => {
    expect(wagerProfit(lost)).toBe(-10);
  });

  it('a void is 0 whether or not the refund is stored as the payout', () => {
    expect(wagerProfit(voided)).toBe(0);
    expect(wagerProfit({ status: 'void', stake: 10, payout: 10 })).toBe(0);
  });

  it('an open wager has no figure yet', () => {
    expect(wagerProfit(open)).toBeNull();
  });
});

describe('netProfit', () => {
  it('sums settled wagers and ignores open ones', () => {
    // +15 - 10 + 0, the open 10-credit stake does not count.
    expect(netProfit([won, lost, voided, open])).toBe(5);
  });

  it('equals sum(payout) - sum(stake) over settled wagers', () => {
    const settled: ProfitInput[] = [
      won,
      lost,
      { status: 'won', stake: 100, payout: 210 },
      { status: 'lost', stake: 20, payout: null },
    ];
    const payouts = settled.reduce((s, w) => s + (w.payout ?? 0), 0);
    const stakes = settled.reduce((s, w) => s + w.stake, 0);
    expect(netProfit([...settled, open])).toBe(payouts - stakes);
  });

  it('is 0 with nothing settled', () => {
    expect(netProfit([])).toBe(0);
    expect(netProfit([open, open])).toBe(0);
  });
});

describe('formatSignedCredits', () => {
  it('signs gains and losses with a real minus sign', () => {
    expect(formatSignedCredits(15)).toBe('+15');
    expect(formatSignedCredits(-10)).toBe('\u221210');
    expect(formatSignedCredits(0)).toBe('0');
  });
});
