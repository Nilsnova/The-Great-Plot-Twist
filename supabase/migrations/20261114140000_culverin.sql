-- =============================================================================
-- 20261114140000_culverin.sql
--
-- WHAT IT DOES
--   The culverin (T43, decision D048 proposed; specs/T43-new-defenses.md): a long
--   gun, the first tower kind of the flag defenses_v2. It stands on the seven
--   tower spots cannon_1..cannon_7 of an island, next to the cannon, the mortar
--   and the harpoon tower. Its prices and the waves its levels open after are in
--   backend/content/defenses_v2.json (80, 160, 320, 640, 1280; levels 1 to 3
--   after wave 15, 4 after 20, 5 after 30), merged into the island catalogue only
--   while the flag is on; the server checks both before it calls island_build()
--   or island_upgrade().
--
--     islet_buildings      the check rule islet_buildings_plot_fits_building
--                          (plot, building_type) allows the 7 new pairs
--                          (cannon_1..cannon_7, culverin). Every pair of
--                          20261113020000_harpoon_tower.sql stays allowed, so no
--                          row needs to change.
--     wave_rules           the check rule wave_rules_known_names also allows the
--                          rule name defenses_v2 (SIM_RULES in
--                          backend/server/island/wave_rules.py): a wave kept with
--                          it lets every client's sim fight with the culverins.
--
--   Nothing else changes. The culverin has no skills yet, so the check rule
--   islet_buildings_spec_fits_kind (building_type, spec) stays as it is: a
--   culverin row must have spec null. island_build(), island_upgrade(),
--   island_demolish() and the wave functions take the kind as an argument and
--   read prices from the server, so they need no change. Pirate Point's own rule
--   (pirate_point_buildings_spot_fits_kind) is not touched: no culverin there.
--
-- WHAT IT NEEDS
--   20261113020000_harpoon_tower.sql (the spot rule it replaces) and
--   20261114130500_wave_rules.sql (the table wave_rules).
--
-- SAFE TO RUN AGAIN
--   Each constraint is dropped if it exists and added again; the comments repeat.
--
-- ROLLBACK (by hand, only while no row is a culverin and no wave keeps defenses_v2)
--   Run the spot rule section of 20261113020000_harpoon_tower.sql and the
--   wave_rules_known_names section of 20261114130500_wave_rules.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('islet_buildings_plot_fits_building', 'wave_rules_known_names');
--   -- the spot list holds ('cannon_1', 'culverin') ... ('cannon_7', 'culverin');
--   -- the rule names are tower_health, pathing, rescue and defenses_v2
--
-- Switch the flag defenses_v2 on only after this migration is applied: before it
-- the database refuses a culverin build (and a wave kept with defenses_v2).
-- =============================================================================

-- The pairs repeat backend/content/buildings.json (the four home islet pairs),
-- backend/content/islands.json (spots) and backend/content/defenses_v2.json (the
-- culverin's spots); a test keeps them equal (backend/server/tests/test_island_rules.py).

alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building;

alter table public.islet_buildings
  add constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station'),
      ('wall_1', 'wall'),
      ('wall_2', 'wall'),
      ('wall_3', 'wall'),
      ('wall_4', 'wall'),
      ('wall_5', 'wall'),
      ('wall_6', 'wall'),
      ('wall_7', 'wall'),
      ('wall_8', 'wall'),
      ('wall_9', 'wall'),
      ('wall_10', 'wall'),
      ('wall_11', 'wall'),
      ('wall_12', 'wall'),
      ('cannon_1', 'cannon'),
      ('cannon_1', 'mortar'),
      ('cannon_1', 'harpoon'),
      ('cannon_1', 'culverin'),
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_2', 'harpoon'),
      ('cannon_2', 'culverin'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_3', 'harpoon'),
      ('cannon_3', 'culverin'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_4', 'harpoon'),
      ('cannon_4', 'culverin'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_5', 'harpoon'),
      ('cannon_5', 'culverin'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_6', 'harpoon'),
      ('cannon_6', 'culverin'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('cannon_7', 'harpoon'),
      ('cannon_7', 'culverin'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));


comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 22 island spots (islands.json: wall_1..12 wall, the shore walls 1..6 and the inner ring 7..12; cannon_1..7 cannon, mortar or harpoon, and with defenses_v2.json the culverin; tower_1 watchtower, house_1..2 house). The cabin has no row.';

alter table public.wave_rules drop constraint if exists wave_rules_known_names;
-- Only the names the server knows (SIM_RULES in backend/server/island/wave_rules.py).
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'rescue', 'defenses_v2']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, rescue, defenses_v2) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';
