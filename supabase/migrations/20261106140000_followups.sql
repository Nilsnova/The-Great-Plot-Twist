-- =============================================================================
-- 20261106140000_followups.sql
--
-- WHAT IT DOES
--   Keeps crew versions current when delete_player() hands a crew over or frees
--   a seat. One deletion advances each affected crew once, even when both happen.
--   Records the decided rule that a player keeps their own Act 1 entry kit.
--
-- WHO USES IT
--   The account deletion route calls this function with the verified player id.
--   Claude reviews and applies this file; agents never apply it to the live game.
--   Requires the foundation, accounts and crew-codes migrations (group 1).
--
-- SAFE TO RUN TWICE
--   Replaces the function without changing its signature, grants or return shape.
--   Comments and grants simply repeat. The migration itself changes no game rows.
-- =============================================================================

create or replace function public.delete_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock affected crews in a shared order before any auth user. Another deleting
  -- member must not hold its auth row while our handover checks that member's FK.
  perform 1
    from public.crews as c
   where c.created_by = p_player_id
      or exists (
           select 1
             from public.crew_seats as s
            where s.crew_id = c.id
              and s.player_id = p_player_id
         )
   order by c.id
   for update;

  -- Same-player retries also serialize; a retry after deletion changes no crew.
  perform 1 from auth.users where id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Keep the original lowest-seat handover. Include crews where the player is
  -- only seated: losing that seat also invalidates a previously read version.
  -- One update per crew avoids counting the handover and freed seat twice.
  -- This separate statement gets a fresh snapshot after the crew-lock wait, so
  -- a handover never chooses a member that another deletion has just removed.
  update public.crews as c
     set created_by = case
           when c.created_by = p_player_id then coalesce((
             select s.player_id
               from public.crew_seats as s
              where s.crew_id = c.id
                and s.player_id is not null
                and s.player_id <> p_player_id
              order by s.seat_no
              limit 1
           ), c.created_by)
           else c.created_by
         end,
         version = c.version + 1
   where c.created_by = p_player_id
      or exists (
           select 1
             from public.crew_seats as s
            where s.crew_id = c.id
              and s.player_id = p_player_id
         );

  -- A crew with no other player keeps its owner above and is deleted here by
  -- cascade, as before. The same cascade removes the deleted player's seats.
  delete from auth.users where id = p_player_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke all on function public.delete_player(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_player(uuid)
  to service_role;

comment on function public.delete_player(uuid) is
  'Deletes the verified player and their data by cascade. Hands owned crews to the player in the lowest other seat; crews without another player are deleted. Increments the version once for each crew whose owner or seats change. Returns {status: deleted} or {status: not_found} on a repeat. SECURITY DEFINER with an empty search path; only service_role may run it.';
comment on column public.crews.version is
  'How many times the crew changed, starting at 1. Crew functions and delete_player() advance it when ownership or seats change, so a request cannot act on an old picture of the crew.';
comment on column public.crew_seats.kit is
  'The entry kit this seat carries: true_keeper, witness, informant or stranger. A player carries the kit of their own Act 1 ending, also after they take over a partner''s seat (D018, decided by Nils). An NPC partner carries a kit the players are missing. The rule is checked for every new or changed row.';
