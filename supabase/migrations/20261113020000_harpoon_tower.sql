-- =============================================================================
-- 20261113020000_harpoon_tower.sql
--
-- WHAT IT DOES
--   The harpoon tower (docs/GAME-V3.md section 5, lane T1): a new tower kind that
--   slows ships. It stands on the seven tower spots cannon_1..cannon_7 of an
--   island, next to the cannon and the mortar. Its prices are in
--   backend/content/islands.json (kind "harpoon": 40, 80, 160, 320, 640) and its
--   levels open by backend/content/campaign.json (levels 1 to 3 after wave 12,
--   level 4 after wave 15, level 5 after wave 20); the server checks both before
--   it calls island_build() or island_upgrade().
--
--     islet_buildings      the check rule islet_buildings_plot_fits_building
--                          (plot, building_type) allows the 7 new pairs
--                          (cannon_1..cannon_7, harpoon). Every pair an existing
--                          row uses stays allowed, so no row needs to change.
--
--   Nothing else changes. The harpoon has no skills yet, so the check rule
--   islet_buildings_spec_fits_kind (building_type, spec) stays as it is: a
--   harpoon row must have spec null. island_build(), island_upgrade(),
--   island_demolish() and the wave functions take the kind as an argument and
--   read prices from the server, so they need no change. Pirate Point's own rule
--   (pirate_point_buildings_spot_fits_kind) is not touched: its tower spots stay
--   cannon or mortar.
--
-- WHAT IT NEEDS
--   20261112020000_inner_walls.sql (the rule it replaces).
--
-- SAFE TO RUN AGAIN
--   The constraint is dropped if it exists and added again; the comment repeats.
--
-- ROLLBACK (by hand, only while no row is a harpoon)
--   Run the section of 20261112020000_inner_walls.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'islet_buildings_plot_fits_building';
--   -- the list holds ('cannon_1', 'harpoon') ... ('cannon_7', 'harpoon')
-- =============================================================================

-- The pairs repeat backend/content/buildings.json (the four home islet pairs) and
-- backend/content/islands.json (spots); a test keeps them equal
-- (backend/server/tests/test_island_rules.py).

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
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_2', 'harpoon'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_3', 'harpoon'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_4', 'harpoon'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_5', 'harpoon'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_6', 'harpoon'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('cannon_7', 'harpoon'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 22 island spots (islands.json: wall_1..12 wall, the shore walls 1..6 and the inner ring 7..12; cannon_1..7 cannon, mortar or harpoon, tower_1 watchtower, house_1..2 house). The cabin has no row.';
