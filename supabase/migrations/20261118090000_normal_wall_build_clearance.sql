-- The game server checks the settled cell against scenery, using the same rules as Move.
-- Fence the exact input under the same island lock as Move before charging for a fresh wall.
create or replace function public.island_build_checked_wall(
  p_player_id uuid,
  p_island_owner uuid,
  p_plot text,
  p_action_uid text,
  p_price integer,
  p_seen jsonb,
  p_x_half integer,
  p_z_half integer,
  p_materialize boolean,
  p_recovery_version integer,
  p_hidden_extra_plots text[],
  p_existing_extra_spots boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ref text := 'island:' || p_action_uid;
  v_scope_key bigint;
  v_balance bigint;
  v_layout jsonb;
  v_reply jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_plot !~ '^wall_([1-9]|1[0-2])$'
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1
     or jsonb_typeof(p_seen) is distinct from 'array'
     or p_x_half is null or p_x_half not between -60 and 60
     or p_z_half is null or p_z_half not between -60 and 60
     or p_materialize is null or p_recovery_version is null or p_recovery_version not in (0, 1)
     or p_hidden_extra_plots is null or p_existing_extra_spots is null then
    raise exception 'bad_checked_wall_build';
  end if;

  -- Match the treasury's signed actor/target scope order before taking any rows.
  for v_scope_key in
    select distinct pg_catalog.hashtextextended('island-economy:' || scope.owner_id::text, 0)
      from pg_catalog.unnest(array[p_player_id, p_island_owner]) as scope(owner_id)
      order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_scope_key);
  end loop;

  -- Legacy payment locks payer wallet, target island, then the islet row.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  -- A concurrent retry can hit after the server's original receipt read. It must
  -- return the previous purchase even if this layout differs from the one it checked.
  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'repeat', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('plot', plot, 'x_half', x_half, 'z_half', z_half)
                            order by plot collate "C"), '[]'::jsonb)
    into v_layout from public.island_layout where island_owner = p_island_owner;
  if v_layout is distinct from p_seen
     or coalesce((select recovery_version from public.island_recovery_state
                   where island_owner = p_island_owner), 0) <> p_recovery_version then
    return jsonb_build_object('status', 'refused', 'reason', 'layout_changed');
  end if;

  begin
    if cardinality(p_hidden_extra_plots) > 0 then
      -- The legacy solo purchase also takes the islet lock. Fence its building rows
      -- before relying on the hidden extra slots that participate in wall settlement.
      insert into public.islets (player_id, timber) values (p_island_owner, 0)
      on conflict (player_id) do nothing;
      perform 1 from public.islets where player_id = p_island_owner for update;
      if (exists (
        select 1 from public.islet_buildings
         where player_id = p_island_owner and plot = any(p_hidden_extra_plots)
      )) <> p_existing_extra_spots then
        v_reply := jsonb_build_object('status', 'refused', 'reason', 'layout_changed');
        raise sqlstate 'P0454';
      end if;
    end if;
    if p_materialize then
      insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
      values (p_island_owner, p_plot, p_x_half, p_z_half, p_player_id)
      on conflict (island_owner, plot) do update
        set x_half = excluded.x_half, z_half = excluded.z_half,
            moved_by = excluded.moved_by, moved_at = now();
    end if;

    if p_player_id = p_island_owner then
      v_reply := public.islet_build(p_player_id, p_plot, 'wall', p_price, 0, 0, v_ref);
      if v_reply ->> 'status' = 'done' then
        v_reply := v_reply || jsonb_build_object('repeat', false);
      end if;
    else
      v_reply := public.island_build(p_player_id, p_island_owner, p_plot, 'wall',
                                    p_action_uid, p_price);
    end if;
    if v_reply ->> 'status' is distinct from 'done'
       or coalesce((v_reply ->> 'repeat')::boolean, false) then
      -- Roll back tentative layout/islet writes when the purchase does not create a wall.
      raise sqlstate 'P0454';
    end if;
  exception when sqlstate 'P0454' then
    return v_reply;
  end;
  return v_reply;
end;
$$;

revoke all on function public.island_build_checked_wall(
  uuid, uuid, text, text, integer, jsonb, integer, integer, boolean, integer, text[], boolean
) from public, anon, authenticated, service_role;
grant execute on function public.island_build_checked_wall(
  uuid, uuid, text, text, integer, jsonb, integer, integer, boolean, integer, text[], boolean
) to service_role;
