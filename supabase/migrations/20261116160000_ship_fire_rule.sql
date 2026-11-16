-- =============================================================================
-- 20261116160000_ship_fire_rule.sql
--
-- WHAT IT DOES
--   Ship fire at real targets (T50, the owner's play-test of 16 Nov): with the
--   wave rule ship_fire every client's sim has a ship at anchor fire at a real
--   wall, tower or the island's heart, and the hit costs that target health
--   (frontend/src/pirates/ship-fire.js). The rule is switched on by the feature
--   flag ship_fire and kept per wave like the others (wave_rules_keep()), so a
--   wave that started without it plays without it to its end.
--
--     wave_rules           the check rule wave_rules_known_names also allows the
--                          rule name ship_fire (SIM_RULES in
--                          backend/server/island/wave_rules.py).
--
--   Nothing else changes: no table, column, function or grant. The wave
--   functions take no rule names, so they need no change.
--
-- WHAT IT NEEDS
--   20261114130500_wave_rules.sql (the table wave_rules),
--   20261114140000_culverin.sql (defenses_v2) and
--   20261115160000_tower_obstacles.sql (tower_obstacles). This file is the
--   latest check rule, so it lists every name of SIM_RULES: tower_health,
--   pathing, tower_obstacles, rescue, defenses_v2 and ship_fire. Applied after
--   20261115160000 it keeps that file's tower_obstacles; applied without it, it
--   allows tower_obstacles all the same (only a name, harmless).
--
-- SAFE TO RUN AGAIN
--   The constraint is dropped if it exists and added again; the comment repeats.
--
-- ROLLBACK (by hand, only while no wave keeps ship_fire)
--   Run 20261115160000_tower_obstacles.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'wave_rules_known_names';
--   -- the rule names are tower_health, pathing, tower_obstacles, rescue,
--   -- defenses_v2 and ship_fire
--
-- Switch the flag ship_fire on only after this migration is applied: before it
-- the database refuses to keep a wave with ship_fire, and such a wave then plays
-- with no rules at all (the server logs it and leaves "rules" out).
-- =============================================================================

alter table public.wave_rules drop constraint if exists wave_rules_known_names;
-- Only the names the server knows (SIM_RULES in backend/server/island/wave_rules.py).
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2', 'ship_fire']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, tower_obstacles, rescue, defenses_v2, ship_fire) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';
