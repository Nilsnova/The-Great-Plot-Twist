-- VIS68: fresh original-wall purchases use a checked layout and one atomic transaction.
-- Additive, owner-applied migration. Apply before deploying the guarded backend;
-- missing overloads fail closed. Existing signatures and already-built rows remain intact.

create or replace function public.island_wall_scenery_obstacles()
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select $obstacles$[
    {"id":"tree_1","name":"a tree","x":-15,"z":6,"radius":0.48},
    {"id":"tree_2","name":"a tree","x":-16,"z":0,"radius":0.48},
    {"id":"tree_3","name":"a tree","x":-13,"z":-12,"radius":0.48},
    {"id":"tree_4","name":"a tree","x":-9,"z":-17,"radius":0.48},
    {"id":"tree_5","name":"a tree","x":9,"z":-17,"radius":0.48},
    {"id":"tree_6","name":"a tree","x":15,"z":-8,"radius":0.48},
    {"id":"tree_7","name":"a tree","x":16,"z":2,"radius":0.48},
    {"id":"tree_8","name":"a tree","x":14,"z":11,"radius":0.48},
    {"id":"tree_9","name":"a tree","x":-12,"z":13,"radius":0.48},
    {"id":"bench","name":"the bench","x":4,"z":13,"w":2.5,"d":0.75},
    {"id":"barrel","name":"the barrel","x":-10.5,"z":8,"w":1.25,"d":0.75},
    {"id":"lantern","name":"the lantern","x":-3,"z":12,"w":0.5,"d":0.5},
    {"id":"record","name":"the record board","x":-3.5,"z":2.5,"w":1.5,"d":0.75},
    {"id":"statue","name":"the statue","x":4,"z":5.5,"w":2.5,"d":1}
  ]$obstacles$::jsonb;
$$;

create or replace function public.island_wall_default_positions()
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select '{"wall_1":[-18.5,-1],"wall_2":[19,1],"wall_3":[19,-1],
    "wall_4":[-1,17],"wall_5":[1,17],"wall_6":[-18.5,-3],
    "wall_7":[8.5,2],"wall_8":[0.5,9.5],"wall_9":[-1.5,9.5],
    "wall_10":[-9.5,-1],"wall_11":[-9.5,1],"wall_12":[8.5,0]}'::jsonb;
$$;

create or replace function public.island_wall_scenery_clear(p_x numeric, p_z numeric)
returns boolean language sql immutable strict security invoker set search_path = '' as $$
  select not exists (
    select 1 from jsonb_array_elements(public.island_wall_scenery_obstacles()) o
    where case when o ? 'radius' then
      power(greatest(abs(p_x-(o->>'x')::numeric)-1,0),2)
        +power(greatest(abs(p_z-(o->>'z')::numeric)-1,0),2)
          < power((o->>'radius')::numeric,2)
    else abs(p_x-(o->>'x')::numeric) < (2+(o->>'w')::numeric)/2
      and abs(p_z-(o->>'z')::numeric) < (2+(o->>'d')::numeric)/2 end
  );
$$;

-- Last constraint for fresh original-wall inserts, including older service signatures.
-- Application purchases hold wallet then owner locks in the guarded wrapper below.
-- Do not acquire an owner lock here after legacy islet_build has taken its islet lock.
create or replace function public.island_original_wall_scenery_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_x numeric; v_z numeric; v_default jsonb;
begin
  if new.building_type <> 'wall'
     or coalesce(public.island_wall_number(new.plot),0) not between 1 and 12 then return new; end if;
  select x_half/2.0,z_half/2.0 into v_x,v_z from public.island_layout
    where island_owner=new.player_id and plot=new.plot;
  if not found then
    v_default := public.island_wall_default_positions()->new.plot;
    v_x := (v_default->>0)::numeric; v_z := (v_default->>1)::numeric;
  end if;
  if not public.island_wall_scenery_clear(v_x,v_z) then
    raise check_violation using message='wall_scenery_overlap';
  end if;
  return new;
end;
$$;
drop trigger if exists island_original_wall_scenery_guard on public.islet_buildings;
create trigger island_original_wall_scenery_guard before insert on public.islet_buildings
  for each row execute function public.island_original_wall_scenery_guard();

create or replace function public.island_wall_single_build(
  p_player_id uuid,p_island_owner uuid,p_plot text,p_price bigint,p_action_uid text,
  p_friend boolean,p_x_half integer,p_z_half integer,p_seen jsonb,
  p_expected_rule_version integer,p_expected_capacity integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_now jsonb; v_reply jsonb; v_detail text;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_plot !~ '^wall_([1-9]|1[0-2])$'
     or p_price is null or p_price not between 1 and 2147483647
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_friend is null or (not p_friend and p_player_id<>p_island_owner)
     or p_x_half is null or p_z_half is null
     or abs(p_x_half::bigint)>60 or abs(p_z_half::bigint)>60
     or jsonb_typeof(p_seen) is distinct from 'array'
     or p_expected_rule_version is null or p_expected_capacity is null then
    raise exception 'bad_wall_single_build';
  end if;
  perform 1 from public.wallets where player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  perform 1 from public.islands where player_id=p_island_owner for update;
  if not found then return jsonb_build_object('status','refused','reason','no_island'); end if;
  if p_player_id<>p_island_owner and not exists(select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_player_id and left_at is null) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  -- Original replay and already-standing refusals precede today's geometry and CAS.
  if exists(select 1 from public.wallet_transactions where player_id=p_player_id
       and reason='building_purchase' and ref='island:'||p_action_uid)
     or exists(select 1 from public.islet_buildings
       where player_id=p_island_owner and plot=p_plot) then
    return case when p_friend then
      public.island_build(p_player_id,p_island_owner,p_plot,'wall',p_action_uid,p_price::integer)
      else public.islet_build(p_player_id,p_plot,'wall',p_price,0,0,'island:'||p_action_uid) end;
  end if;
  v_now := public.island_wall_layout_read(p_island_owner);
  if (v_now->>'ruleVersion')::integer<>p_expected_rule_version
     or (v_now->>'capacity')::integer<>p_expected_capacity
     or v_now->'rows' is distinct from p_seen then
    return jsonb_build_object('status','refused','reason','busy');
  end if;
  if not public.island_wall_scenery_clear(p_x_half/2.0,p_z_half/2.0) then
    return jsonb_build_object('status','refused','reason','place_taken');
  end if;
  -- A legacy off-lane raw row may display at a different effective lane cell.
  -- Persist only this fresh purchase's checked cell. A refused JSON reply must
  -- roll that materialization back too, so use a bounded subtransaction.
  begin
    insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by)
      values(p_island_owner,p_plot,p_x_half,p_z_half,p_player_id)
      on conflict(island_owner,plot) do update set x_half=excluded.x_half,
        z_half=excluded.z_half,moved_by=excluded.moved_by,moved_at=now();
    v_reply := case when p_friend then
      public.island_build(p_player_id,p_island_owner,p_plot,'wall',p_action_uid,p_price::integer)
      else public.islet_build(p_player_id,p_plot,'wall',p_price,0,0,'island:'||p_action_uid) end;
    if v_reply->>'status' is distinct from 'done' then
      raise exception using errcode='P6801',message='wall_purchase_refused',detail=v_reply::text;
    end if;
    return v_reply;
  exception when sqlstate 'P6801' then
    get stacked diagnostics v_detail=pg_exception_detail;
    return v_detail::jsonb;
  end;
end;
$$;

-- Mandatory extra fields select these overloads. Non-wall calls keep their exact
-- old signatures; an old schema cannot silently select an unguarded overload.
create or replace function public.islet_build(
  p_player_id uuid,p_plot text,p_building_type text,p_coins bigint,p_timber integer,
  p_starter_timber integer,p_ref text,p_x_half integer,p_z_half integer,p_seen jsonb,
  p_expected_rule_version integer,p_expected_capacity integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_building_type is distinct from 'wall' or p_timber is distinct from 0
    or p_starter_timber is distinct from 0 or p_ref is null
    or p_ref !~ '^island:[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_wall_single_build';
  end if;
  return public.island_wall_single_build(p_player_id,p_player_id,p_plot,p_coins,
    substring(p_ref from 8),false,p_x_half,p_z_half,p_seen,p_expected_rule_version,p_expected_capacity);
end;
$$;
create or replace function public.island_build(
  p_player_id uuid,p_island_owner uuid,p_plot text,p_building_type text,p_action_uid text,
  p_price integer,p_x_half integer,p_z_half integer,p_seen jsonb,
  p_expected_rule_version integer,p_expected_capacity integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_building_type is distinct from 'wall' then raise exception 'bad_wall_single_build'; end if;
  return public.island_wall_single_build(p_player_id,p_island_owner,p_plot,p_price,
    p_action_uid,true,p_x_half,p_z_half,p_seen,p_expected_rule_version,p_expected_capacity);
end;
$$;

revoke all on function public.island_wall_scenery_obstacles(),public.island_wall_default_positions(),
  public.island_wall_scenery_clear(numeric,numeric),public.island_original_wall_scenery_guard(),
  public.island_wall_single_build(uuid,uuid,text,bigint,text,boolean,integer,integer,jsonb,integer,integer),
  public.islet_build(uuid,text,text,bigint,integer,integer,text,integer,integer,jsonb,integer,integer),
  public.island_build(uuid,uuid,text,text,text,integer,integer,integer,jsonb,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.island_wall_scenery_obstacles(),public.island_wall_default_positions(),
  public.island_wall_scenery_clear(numeric,numeric),public.island_original_wall_scenery_guard(),
  public.island_wall_single_build(uuid,uuid,text,bigint,text,boolean,integer,integer,jsonb,integer,integer),
  public.islet_build(uuid,text,text,bigint,integer,integer,text,integer,integer,jsonb,integer,integer),
  public.island_build(uuid,uuid,text,text,text,integer,integer,integer,jsonb,integer,integer)
  to service_role;
