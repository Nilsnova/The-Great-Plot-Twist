-- Allow the T35 tower obstacle rule to be kept with a wave after pathing and tower_health are deployed.
-- Used by: wave_rules_keep()'s existing known-name check. Rollback: switch the flag off; keep this allowed name
-- while any wave_rules row could contain it, then a later cleanup migration may remove it.
alter table public.wave_rules drop constraint if exists wave_rules_known_names;
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, tower_obstacles, rescue, defenses_v2) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';
