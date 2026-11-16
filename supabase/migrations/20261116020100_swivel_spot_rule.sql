-- =============================================================================
-- 20261116020100_swivel_spot_rule.sql
--
-- WHAT IT DOES
--   The follow-up of 20261116020000_tower_trees.sql (decision D055): the check
--   rule islet_buildings_plot_fits_building also allows the swivel-gun nest on
--   the seven island tower spots, the 7 pairs (cannon_1..cannon_7, swivel).
--   Every pair of 20261114140000_culverin.sql stays allowed, so no row needs to
--   change. The swivel has no skills, so islet_buildings_spec_fits_kind stays
--   as it is (spec null). island_build(), island_upgrade() and island_demolish()
--   take the kind as an argument and read prices from the server: no change.
--
-- WHY A SEPARATE FILE
--   A check rule cannot be widened without DROP CONSTRAINT, and a live migration
--   with a DROP needs the owner's confirmation in the Supabase connector. So the
--   one DROP lives here, alone, replaced in the SAME statement (the table is never
--   without the rule). Until this file is applied a swivel build is refused by
--   the database (a check violation: the server answers 502 and charges nothing);
--   everything else of D055 works.
--
-- WHAT IT NEEDS
--   20261114140000_culverin.sql (the rule it widens). Independent of
--   20261116020000_tower_trees.sql, but applied after it by its timestamp.
--
-- SAFE TO RUN AGAIN
--   The constraint is dropped if it exists and added again; the comment repeats.
--
-- ROLLBACK (by hand, only while no row is a swivel)
--   Run the spot rule section of 20261114140000_culverin.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'islet_buildings_plot_fits_building';
--   -- the list holds ('cannon_1', 'swivel') ... ('cannon_7', 'swivel')
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The swivel-gun nest on the seven tower spots
-- -----------------------------------------------------------------------------
-- The pairs repeat backend/content/buildings.json (the four home islet pairs),
-- backend/content/islands.json (spots, now with the swivel) and
-- backend/content/defenses_v2.json (the culverin's spots); a test keeps them
-- equal (backend/server/tests/test_island_rules.py). One statement: the old rule
-- goes and the wider one comes in the same step.

alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building,
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
      ('cannon_1', 'swivel'),
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_2', 'harpoon'),
      ('cannon_2', 'culverin'),
      ('cannon_2', 'swivel'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_3', 'harpoon'),
      ('cannon_3', 'culverin'),
      ('cannon_3', 'swivel'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_4', 'harpoon'),
      ('cannon_4', 'culverin'),
      ('cannon_4', 'swivel'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_5', 'harpoon'),
      ('cannon_5', 'culverin'),
      ('cannon_5', 'swivel'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_6', 'harpoon'),
      ('cannon_6', 'culverin'),
      ('cannon_6', 'swivel'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('cannon_7', 'harpoon'),
      ('cannon_7', 'culverin'),
      ('cannon_7', 'swivel'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 22 island spots (islands.json: wall_1..12 wall, the shore walls 1..6 and the inner ring 7..12; cannon_1..7 cannon, mortar, harpoon or swivel, and with defenses_v2.json the culverin; tower_1 watchtower, house_1..2 house). The cabin has no row.';
