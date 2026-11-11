// What each cutscene shows: shots over line ranges, built from layers of the game's own local art.
// art is a path under the site root (img-src 'self'); className places the layer (cutscenes.css);
// depth is how far a layer drifts during the shot in pixels, so near layers move more (parallax).
// Since the mystery left the game (D031) the dark schooner is simply the pirate ship.
export const scenes = {
  lore_intro: [
    {from: 0, to: 1, sky: 'dusk', layers: [
      {art: 'places/title.webp', className: 'shot-backdrop', depth: 40},
    ]},
    {from: 2, to: 2, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-back', depth: 30},
      {art: 'pixel/lighthouse.png', className: 'shot-lighthouse', depth: 12},
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-front', depth: -70},
    ]},
    {from: 3, to: 3, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-back', depth: 30},
      {art: 'pixel/dark-schooner.png', className: 'shot-boat', depth: -160},
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-front', depth: -70},
    ]},
    {from: 4, to: 5, sky: 'harbor', layers: [
      {art: 'pixel/harbour-office.png', className: 'shot-office', depth: 18},
      {art: 'pixel/harbour-office-glow.png', className: 'shot-office', depth: 18},
      {art: 'pixel/lantern.png', className: 'shot-lantern', depth: -10},
      {art: 'pixel/crew-navigator.png', className: 'shot-captain shot-captain-a', depth: -30},
      {art: 'pixel/crew-deckhand.png', className: 'shot-captain shot-captain-b', depth: -36},
      {art: 'pixel/explorer.png', className: 'shot-hero', depth: -60},
    ]},
  ],
  harbor_arrival: [
    {from: 0, to: 1, sky: 'harbor', layers: [
      {art: 'pixel/harbour-office.png', className: 'shot-office', depth: 18},
      {art: 'pixel/harbour-office-glow.png', className: 'shot-office', depth: 18},
      {art: 'pixel/explorer.png', className: 'shot-hero', depth: -50},
    ]},
  ],
  lock_opens: [
    {from: 0, to: 1, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-back', depth: 30},
      {art: 'pixel/lighthouse.png', className: 'shot-lighthouse', depth: 12},
    ]},
    {from: 2, to: 3, sky: 'dusk', layers: [
      {art: 'pixel/lantern.png', className: 'shot-centre', depth: -10},
    ]},
  ],
  lamps_relit: [
    {from: 0, to: 0, sky: 'night', layers: [
      {art: 'pixel/festival-lamp-01-lit-night.png', className: 'shot-lamp shot-lamp-a', depth: 0},
      {art: 'pixel/festival-lamp-02-lit-night.png', className: 'shot-lamp shot-lamp-b', depth: 0},
      {art: 'pixel/festival-lamp-03-lit-night.png', className: 'shot-lamp shot-lamp-c', depth: 0},
    ]},
    {from: 1, to: 3, sky: 'dawn', layers: [
      {art: 'places/title.webp', className: 'shot-backdrop', depth: 50},
    ]},
  ],
  island_arrival: [
    {from: 0, to: 1, sky: 'dusk', layers: [
      {art: 'places/title.webp', className: 'shot-backdrop', depth: 30},
      {art: 'pixel/explorer.png', className: 'shot-hero', depth: -50},
    ]},
  ],
  wave_won: [
    {from: 0, to: 0, sky: 'night', layers: [
      {art: 'pixel/dark-schooner.png', className: 'shot-boat', depth: -120},
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-front', depth: -70},
    ]},
    {from: 1, to: 1, sky: 'dawn', layers: [
      {art: 'places/title.webp', className: 'shot-backdrop', depth: 30},
      {art: 'pixel/lantern.png', className: 'shot-lantern', depth: -10},
    ]},
  ],
  wave_lost: [
    {from: 0, to: 1, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-back', depth: 30},
      {art: 'pixel/dark-schooner.png', className: 'shot-boat', depth: 160},
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-front', depth: -70},
    ]},
  ],
  armada: [
    {from: 0, to: 0, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'shot-fog shot-fog-back', depth: 30},
      {art: 'pixel/dark-schooner.png', className: 'shot-boat', depth: -160},
    ]},
    {from: 1, to: 2, sky: 'night', layers: [
      {art: 'pixel/lighthouse.png', className: 'shot-lighthouse', depth: 12},
      {art: 'pixel/festival-lamp-01-lit-night.png', className: 'shot-lamp shot-lamp-a', depth: 0},
      {art: 'pixel/festival-lamp-02-lit-night.png', className: 'shot-lamp shot-lamp-b', depth: 0},
      {art: 'pixel/festival-lamp-03-lit-night.png', className: 'shot-lamp shot-lamp-c', depth: 0},
    ]},
  ],
};
