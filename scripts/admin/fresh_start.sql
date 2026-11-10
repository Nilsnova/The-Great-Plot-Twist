-- =============================================================================
-- scripts/admin/fresh_start.sql
--
-- WHAT IT DOES
--   The fresh start of the redesign (docs/PITCH.md, "Progress"; docs/BUILD-PLAN.md
--   timeline, Thu 19 Nov): every player starts the island game again. Accounts,
--   captain names and island codes stay. In ONE transaction it:
--
--     1. sets every wallet to 100 coins through apply_wallet_transaction(), with
--        the reason fresh_start and the ref below, so the ledger tells the story.
--        A wallet that holds exactly 100 already gets no row (a change of 0 coins
--        is not allowed); a wallet that had this fresh start already is skipped.
--     2. clears every cloud save (saves.data becomes {}; the row stays),
--     3. removes every building from islet_buildings except cabins (the cabin
--        stands from the start and has no row anyway),
--     4. sets the best wave and the flags of every island to 0, and
--     5. removes every wave run (so Pirate Point starts again at wave 1 too);
--        their participants (wave_participants, 20261110020000) go with them.
--
-- THIS IS NOT A MIGRATION
--   It lives outside supabase/migrations/ on purpose: it is run by hand, once,
--   by the project owner (with Claude), never by the migration tool.
--
-- DRY RUN FIRST (the default)
--   With c_apply false (as committed), the whole script runs, and at the end an
--   error stops it ON PURPOSE: "DRY RUN, nothing was changed: ..." with the
--   counts. An error undoes the whole transaction, so nothing changes. Read the
--   counts. Then change c_apply to true and run it again: it ends with a notice
--   "FRESH START APPLIED: ..." and the same kind of counts, and commits.
--   Running the real run twice is harmless: wallets that had this fresh start
--   are skipped, and the rest finds nothing left to clear.
--
-- WHAT IT NEEDS
--   Every migration up to 20261110010000_islands_and_waves.sql (the wallet
--   reason fresh_start, the tables islands and wave_runs). Run it as the
--   database owner (the Supabase SQL editor), because no game role may delete
--   buildings or wave runs.
-- =============================================================================

begin;

do $$
declare
  -- false: a dry run (nothing changes). true: the real run.
  c_apply          constant boolean := false;
  c_starting_coins constant bigint  := 100;
  c_ref            constant text    := 'fresh_start:2026-11-19';

  v_wallet         record;
  v_wallets_set    integer := 0;
  v_wallets_kept   integer := 0;
  v_saves          integer := 0;
  v_buildings      integer := 0;
  v_islands        integer := 0;
  v_waves          integer := 0;
  v_counts         text;
begin
  -- 1. Every wallet to 100 coins, through the one wallet function.
  for v_wallet in
    select player_id, balance from public.wallets order by player_id for update
  loop
    if v_wallet.balance = c_starting_coins
       or exists (
         select 1 from public.wallet_transactions
          where player_id = v_wallet.player_id and reason = 'fresh_start' and ref = c_ref
       ) then
      v_wallets_kept := v_wallets_kept + 1;
    else
      perform public.apply_wallet_transaction(
        v_wallet.player_id, c_starting_coins - v_wallet.balance, 'fresh_start', c_ref
      );
      v_wallets_set := v_wallets_set + 1;
    end if;
  end loop;

  -- 2. Every cloud save empty.
  update public.saves set data = '{}'::jsonb where data <> '{}'::jsonb;
  get diagnostics v_saves = row_count;

  -- 3. Every building except the cabins.
  delete from public.islet_buildings where building_type <> 'cabin';
  get diagnostics v_buildings = row_count;

  -- 4. Every island back to no best wave and no flags.
  update public.islands set wave_best = 0, flags = 0 where wave_best <> 0 or flags <> 0;
  get diagnostics v_islands = row_count;

  -- 5. Every wave run.
  delete from public.wave_runs;
  get diagnostics v_waves = row_count;

  v_counts := format(
    'wallets set to %s: %s, wallets left as they were: %s, saves cleared: %s, '
    'buildings removed: %s, islands reset: %s, wave runs removed: %s',
    c_starting_coins, v_wallets_set, v_wallets_kept, v_saves, v_buildings, v_islands, v_waves
  );

  if c_apply then
    raise notice 'FRESH START APPLIED: %', v_counts;
  else
    -- On purpose: the error undoes everything above.
    raise exception 'DRY RUN, nothing was changed: %', v_counts;
  end if;
end;
$$;

commit;
