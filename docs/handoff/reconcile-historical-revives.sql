-- Review historical paid revivals with the service-only reconciliation RPC.
-- Used by an authorized database owner after 20261118070000_revive_reconciliation.sql.
-- No credentials or connection settings belong in this file. This is not a migration.
--
-- 1. Fill c_payment_ids with at most 100 ORIGINAL captain_revive wallet transaction ids.
--    Keep c_apply=false to inspect classifications without locks, refunds or other writes.
--    Empty ids (the committed default) perform no work. The function also works in a
--    database READ ONLY transaction when c_apply=false.
--    Optional read-only discovery window (advance the numeric cursor explicitly):
--      select id,player_id,delta,ref from public.wallet_transactions
--       where id>0 and id<=5000 and reason='captain_revive' order by id limit 100;
--    Inspect that bounded window; do not automatically feed its ids into apply.
-- 2. Review each result and retained evidence. Only confirmed_missing can receive a refund.
-- 3. For an explicitly authorized refund, put ONE approved original id in c_payment_ids,
--    set c_apply=true, and run again. One apply per transaction preserves wallet/island
--    lock order across different payers. Restore c_apply=false after the operation.
-- 4. Repeating an approved id is safe: the original-payment-derived ledger ref pays once.
--
-- Ambiguous legacy/unlinked-event, incomplete/orphaned and active-wave cases remain unchanged.
-- This tool never invents coordinates or backfills a guessed revival. A verified original
-- request can separately retry recovery_wave_revive with its original UID and valid position.
-- No production audit, refund, migration or deployment is performed by committing this file.

begin;

do $$
declare
  c_payment_ids constant bigint[] := '{}'::bigint[];
  c_apply constant boolean := false;
  v_payment_id bigint;
  v_result jsonb;
begin
  if cardinality(c_payment_ids) > 100 or exists (
    select 1 from unnest(c_payment_ids) as payment_id where payment_id is null or payment_id <= 0
  ) then
    raise exception 'Use at most 100 positive original payment ids.';
  end if;
  if c_apply and cardinality(c_payment_ids) <> 1 then
    raise exception 'Apply exactly one approved payment per transaction.';
  end if;
  for v_payment_id in select distinct payment_id from unnest(c_payment_ids) as payment_id order by payment_id
  loop
    v_result := public.recovery_revive_reconcile(v_payment_id,c_apply);
    raise notice '%',v_result;
  end loop;
  if cardinality(c_payment_ids)=0 then raise notice 'No payment ids selected; nothing changed.'; end if;
end;
$$;

commit;
