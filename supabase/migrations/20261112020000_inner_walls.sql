-- =============================================================================
-- 20261112020000_inner_walls.sql
--
-- WHAT IT DOES
--   Boarding and close combat (docs/TOWER-DEFENSE.md section 12): pirates now
--   climb out of their ships and walk to the island's heart, and the player can
--   surround the heart with an inner ring of walls. The ring is six new wall
--   spots, wall_7..wall_12, with the same kind, prices and levels as the shore
--   walls (backend/content/islands.json).
--
--     islet_buildings      the check rule now allows the 22 island spots: the
--                          16 of 20261111030000_tower_defense.sql and
--                          wall_7..wall_12 (wall). Every pair an existing row
--                          uses stays allowed, so no row needs to change.
--
--   Nothing else changes: island_build(), island_upgrade() and the wave
--   functions take the spot as an argument and the server checks it against
--   islands.json first; the wall's price and level rules are the existing ones.
--
-- SAFE TO RUN AGAIN
--   The constraint is dropped if it exists and added again.
--
-- ROLLBACK (by hand, only while no row uses an inner wall spot)
--   Run the section "2." of 20261111030000_tower_defense.sql again.
-- =============================================================================

-- The pairs repeat backend/content/buildings.json (the four home islet pairs)
-- and backend/content/islands.json (spots); a test keeps them equal
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
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 22 island spots (islands.json: wall_1..12 wall, the shore walls 1..6 and the inner ring 7..12; cannon_1..7 cannon or mortar, tower_1 watchtower, house_1..2 house). The cabin has no row.';
