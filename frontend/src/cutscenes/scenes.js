// What each cutscene shows: shots over line ranges. Every shot is a cartoon panel drawn in code
// (panel names a scene in src/art/scenery.js PANELS; GAME-V3.md §7), so no cutscene downloads an
// image. sky is the plain colour the shot shows until its panel is painted (cutscenes.css).
// lore_intro, island_arrival, wave_won and wave_lost play in the one-island game; harbor_arrival,
// lock_opens, lamps_relit and armada belong to the class demo, Pirate Point and sea travel.
export const scenes = {
  lore_intro: [
    // "On a stormy coast lie the Saltreach Isles." / "For years, the great lighthouse kept their waters safe."
    {from: 0, to: 1, sky: 'dusk', panel: 'coast'},
    // "Three nights ago, its light went dark."
    {from: 2, to: 2, sky: 'night', panel: 'dark'},
    // "And out on the black water, the pirates noticed."
    {from: 3, to: 3, sky: 'night', panel: 'pirates'},
    // "Every captain gets a small island and a few coins." / "Build, trade, and hold the line..."
    {from: 4, to: 5, sky: 'day', panel: 'home'},
  ],
  harbor_arrival: [
    {from: 0, to: 1, sky: 'day', panel: 'harbor'},
  ],
  lock_opens: [
    {from: 0, to: 1, sky: 'night', panel: 'dark'},
    {from: 2, to: 3, sky: 'night', panel: 'relit'},
  ],
  lamps_relit: [
    {from: 0, to: 0, sky: 'night', panel: 'relit'},
    {from: 1, to: 3, sky: 'dawn', panel: 'dawn'},
  ],
  island_arrival: [
    {from: 0, to: 1, sky: 'day', panel: 'home'},
  ],
  wave_won: [
    {from: 0, to: 0, sky: 'night', panel: 'sinking'},
    {from: 1, to: 1, sky: 'dawn', panel: 'dawn'},
  ],
  wave_lost: [
    {from: 0, to: 1, sky: 'night', panel: 'departing'},
  ],
  armada: [
    {from: 0, to: 0, sky: 'night', panel: 'armada'},
    {from: 1, to: 2, sky: 'night', panel: 'relit'},
  ],
};
