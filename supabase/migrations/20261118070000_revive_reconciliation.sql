-- Classify one historical paid revival; refund only a proven missing closed-wave effect.
-- Used by the reviewed owner SQL runner. Default calls read only; there is no public route.
-- No new table, wallet reason, receipt mutation, guessed revival or automatic live action.

create or replace function public.recovery_revive_reconcile(
  p_payment_id bigint, p_apply boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_max_events constant integer := 50000;
  v_payment public.wallet_transactions;
  v_refund public.wallet_transactions;
  v_receipt public.captain_revives;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_result jsonb;
  v_refund_ref text;
  v_target text;
  v_count bigint;
  v_first bigint;
  v_last bigint;
  v_recorded boolean;
  v_possible boolean;
  v_unreadable boolean;
  v_target_joined boolean;
  v_balance bigint;
begin
  if p_payment_id is null or p_payment_id <= 0 or p_apply is null then
    raise exception 'bad_revive_reconciliation';
  end if;
  v_result := jsonb_build_object('paymentId',p_payment_id,'applied',false);
  select * into v_payment from public.wallet_transactions where id=p_payment_id;
  if not found then return v_result || jsonb_build_object('classification','no_payment'); end if;
  if v_payment.reason <> 'captain_revive' or v_payment.delta >= 0
     or v_payment.ref !~ '^revive:[A-Za-z0-9_-]{8,64}$' then
    return v_result || jsonb_build_object('classification','not_revive_payment');
  end if;
  v_result := v_result || jsonb_build_object('amount',-v_payment.delta);
  v_refund_ref := 'revive_refund:' || p_payment_id::text;

  -- A real apply follows the same wallet-first order as paid repair and wave finish.
  -- Dry-run calls deliberately take no row locks and also work in read-only transactions.
  if p_apply then
    select balance into v_balance from public.wallets where player_id=v_payment.player_id for update;
    if not found then return v_result || jsonb_build_object('classification','no_wallet'); end if;
  end if;
  select * into v_refund from public.wallet_transactions
   where player_id=v_payment.player_id and reason='admin_adjust' and ref=v_refund_ref;
  if found then
    if v_refund.delta <> -v_payment.delta then
      return v_result || jsonb_build_object('classification','refund_conflict');
    end if;
    return v_result || jsonb_build_object('classification','already_refunded');
  end if;

  select * into v_receipt from public.captain_revives
   where player_id=v_payment.player_id and ref=v_payment.ref;
  if not found then return v_result || jsonb_build_object('classification','orphaned_debit'); end if;
  select * into v_run from public.wave_runs where id=v_receipt.wave_id;
  if not found then return v_result || jsonb_build_object('classification','missing_wave_history'); end if;

  if p_apply then
    perform 1 from public.islands
     where player_id in (v_payment.player_id,v_run.island_owner) order by player_id for update;
    perform 1 from public.island_recovery_state where island_owner=v_run.island_owner for update;
    perform 1 from public.recovery_wave_states where wave_id=v_receipt.wave_id for update;
    perform 1 from public.wave_runs where id=v_receipt.wave_id for update;
    -- A reset may have committed while the island lock was pending. Recheck its receipt.
    select * into v_receipt from public.captain_revives
     where player_id=v_payment.player_id and ref=v_payment.ref;
    if not found then return v_result || jsonb_build_object('classification','orphaned_debit'); end if;
    select * into v_run from public.wave_runs where id=v_receipt.wave_id;
    if not found then return v_result || jsonb_build_object('classification','missing_wave_history'); end if;
  end if;
  if v_receipt.price <> -v_payment.delta then
    return v_result || jsonb_build_object('classification','payment_mismatch');
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id=v_receipt.wave_id;
  if not found then return v_result || jsonb_build_object('classification','ambiguous_legacy'); end if;
  if v_wave.recovery_version <> 1 or v_wave.wave_protocol <> 2
     or v_run.place <> 'island' or v_run.island_owner is distinct from v_wave.island_owner
     or v_wave.initial_snapshot ->> 'waveId' is distinct from v_wave.wave_id::text
     or v_wave.initial_snapshot ->> 'islandEpoch' is distinct from v_wave.reset_epoch::text
     or v_wave.initial_snapshot ->> 'recoveryVersion' is distinct from '1'
     or v_wave.initial_snapshot ->> 'waveProtocol' is distinct from '2' then
    return v_result || jsonb_build_object('classification','incomplete_history');
  end if;
  v_target := lower(v_receipt.fallen);
  if v_target !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_receipt.down_at not between 0 and 18000 then
    return v_result || jsonb_build_object('classification','missing_target_identity');
  end if;
  if v_wave.journal_head > c_max_events then
    return v_result || jsonb_build_object('classification','history_too_large');
  end if;

  -- Inspect one bounded wave only. Positive unique seq plus count/max/head proves no gaps.
  -- A potentially matching command blocks refund regardless of sender, timestamp or event wrapper.
  select count(*),min(seq),max(seq),
    coalesce(bool_or(payload -> 'command' ->> 'type'='captain_revive'
      and payload ->> 'reviveRef'=v_payment.ref
      and actor_id=v_payment.player_id
      and lower(payload -> 'command' ->> 'targetId')=v_target
      and payload -> 'command' ->> 'downAt'=v_receipt.down_at::text),false),
    coalesce(bool_or((event_kind='captain_revive'
      or payload -> 'command' ->> 'type'='captain_revive'
      or payload ->> 'type'='captain_revive')
      and (coalesce(payload -> 'command' ->> 'targetId',payload ->> 'targetId') is null
        or lower(coalesce(payload -> 'command' ->> 'targetId',payload ->> 'targetId'))=v_target)),false),
    coalesce(bool_or(event_kind='participant_joined' and participant_token::text=v_target
      and lower(payload ->> 'participantToken')=v_target),false),
    coalesce(bool_or((event_kind='captain_input' and (
      jsonb_typeof(payload -> 'command') is distinct from 'object'
      or jsonb_typeof(payload -> 'command' -> 'type') is distinct from 'string'
      or payload -> 'command' ->> 'type' not in ('fire','lamps_lit','captain_shot',
        'captain_strike','captain_move','captain_revive','finisher_ready','finisher_input')))
      or (event_kind='captain_revive' and payload -> 'command' ->> 'type' is distinct from 'captain_revive')
      or ((event_kind='captain_revive' or payload -> 'command' ->> 'type'='captain_revive')
        and (jsonb_typeof(payload -> 'command' -> 'targetId') is distinct from 'string'
          or lower(payload -> 'command' ->> 'targetId') !~
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))),false)
    into v_count,v_first,v_last,v_recorded,v_possible,v_target_joined,v_unreadable
    from (select seq,event_kind,actor_id,participant_token,payload from public.recovery_wave_events
      where wave_id=v_wave.wave_id order by seq limit c_max_events+1) as history;
  if v_count <> v_wave.journal_head or coalesce(v_last,0) <> v_wave.journal_head
     or (v_count > 0 and v_first <> 1) or v_unreadable then
    return v_result || jsonb_build_object('classification','incomplete_history');
  end if;
  if v_recorded then return v_result || jsonb_build_object('classification','recorded'); end if;
  if v_possible then return v_result || jsonb_build_object('classification','ambiguous_old_event'); end if;
  if not v_target_joined and not exists (
    select 1 from jsonb_array_elements(case
      when jsonb_typeof(v_wave.initial_snapshot -> 'participants')='array'
      then v_wave.initial_snapshot -> 'participants' else '[]'::jsonb end) as participant
     where lower(participant ->> 'participantToken')=v_target
  ) then
    return v_result || jsonb_build_object('classification','missing_target_identity');
  end if;
  if v_wave.closed_at is null then
    return v_result || jsonb_build_object('classification','pending_active');
  end if;
  if v_run.finished_at is null or jsonb_typeof(v_wave.closed_hp) is distinct from 'object' then
    return v_result || jsonb_build_object('classification','incomplete_history');
  end if;
  if not p_apply then return v_result || jsonb_build_object('classification','confirmed_missing'); end if;

  v_balance := public.apply_wallet_transaction(
    v_payment.player_id,-v_payment.delta,'admin_adjust',v_refund_ref);
  return v_result || jsonb_build_object('classification','refunded','applied',true,'coins',v_balance);
end;
$$;

revoke all on function public.recovery_revive_reconcile(bigint,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.recovery_revive_reconcile(bigint,boolean) to service_role;
comment on function public.recovery_revive_reconcile(bigint,boolean) is
  'Read-only by default: classifies one original captain_revive debit from retained evidence. Explicit apply locks wallet, sorted islands, recovery state and wave, then refunds only a closed protocol-2 wave with exact receipt/payment, proven target, complete bounded journal and no possibly matching revival. Uses admin_adjust/ref revive_refund:<debit id> once. Legacy, orphaned, active, incomplete or ambiguous histories never receive an automatic refund. No events or receipts are changed.';
