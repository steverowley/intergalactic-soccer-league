-- ── 0102_wager_leaderboard_profit.sql ──────────────────────────────────────
-- Fix the Bankroll board's profit column (#733).
--
-- WHAT WAS WRONG
--   0004 defined net_profit as  sum(payout of won wagers) - sum(stake of ALL
--   wagers). Every OPEN wager therefore counted as a loss the moment it was
--   placed (a fan who staked 500 on tonight's match dropped 500 places'
--   worth of profit before a ball was kicked), and every VOID wager counted
--   as a loss although its stake is refunded.
--
-- THE RULE (one definition, shared with the Wagers page)
--   Profit counts SETTLED wagers only:
--     won   payout - stake
--     lost  -stake
--     void  0
--     open  excluded
--   This mirrors src/features/betting/logic/profit.ts (`wagerProfit`), which
--   the Wagers ledger and its Net P&L summary use; profit.test.ts pins it.
--
-- WHAT DOES NOT CHANGE
--   Column names, order and types are identical (net_profit stays bigint:
--   SUM over an integer expression), so CREATE OR REPLACE is enough and the
--   read path (wagerLeaderboard.ts Zod schema, the read cache allow-list) is
--   untouched. total_staked keeps its meaning (every credit ever staked,
--   open wagers included); it is not shown on any page.
--
-- SECURITY
--   The view stays owner-run (security_invoker = false), as decided in 0069
--   and recorded in 0085: wagers and profiles are own-row-only on SELECT, so
--   an invoker read would show each fan only themselves. Stated explicitly
--   here because CREATE OR REPLACE VIEW replaces the view's options with the
--   ones it is given. Grants and the 0085 comment survive the replace.
--
-- Idempotent: re-running it re-creates the same view.

CREATE OR REPLACE VIEW public.wager_leaderboard
WITH (security_invoker = false) AS
SELECT
  p.id                                         AS user_id,
  p.username,
  p.favourite_team_id,
  COUNT(w.id)                                  AS total_bets,
  COUNT(w.id) FILTER (WHERE w.status = 'won')  AS wins,
  COUNT(w.id) FILTER (WHERE w.status = 'lost') AS losses,
  COALESCE(SUM(w.stake), 0)                    AS total_staked,
  COALESCE(SUM(w.payout) FILTER (WHERE w.status = 'won'), 0) AS total_won,
  -- Profit over settled wagers only (#733); open wagers add nothing.
  COALESCE(SUM(
    CASE w.status
      WHEN 'won'  THEN COALESCE(w.payout, 0) - w.stake
      WHEN 'lost' THEN -w.stake
      ELSE 0
    END
  ), 0)                                        AS net_profit
FROM public.profiles p
LEFT JOIN public.wagers w ON w.user_id = p.id
GROUP BY p.id, p.username, p.favourite_team_id;

GRANT SELECT ON public.wager_leaderboard TO anon, authenticated;
