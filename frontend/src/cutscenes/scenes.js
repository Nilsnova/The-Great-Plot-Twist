// What each cutscene shows: shots over line ranges, built from layers of the game's own local art.
// art is a path under the site root (img-src 'self'); className places the layer (cutscenes.css);
// depth is how far a layer drifts during the shot in pixels, so near layers move more (parallax).
// No reveal art (the schooner, the masked captain or the false light) is used before a solve.
export const scenes = {
  lore_intro: [
    {from: 0, to: 1, sky: 'dusk', layers: [
      {art: 'places/title.webp', className: 'cs-backdrop', depth: 40},
    ]},
    {from: 2, to: 2, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'cs-fog cs-fog-back', depth: 30},
      {art: 'pixel/lighthouse.png', className: 'cs-lighthouse', depth: 12},
      {art: 'pixel/character-elena-vos-portrait.png', className: 'cs-portrait', depth: -20},
      {art: 'pixel/fog-bank.png', className: 'cs-fog cs-fog-front', depth: -70},
    ]},
    {from: 3, to: 3, sky: 'night', layers: [
      {art: 'places/chart.png', className: 'cs-chart', depth: 24},
      {art: 'pixel/sailboat.png', className: 'cs-boat', depth: -160},
    ]},
    {from: 4, to: 5, sky: 'harbor', layers: [
      {art: 'pixel/harbour-office.png', className: 'cs-office', depth: 18},
      {art: 'pixel/harbour-office-glow.png', className: 'cs-office', depth: 18},
      {art: 'pixel/lantern.png', className: 'cs-lantern', depth: -10},
      {art: 'pixel/crew-navigator.png', className: 'cs-captain cs-captain-a', depth: -30},
      {art: 'pixel/crew-deckhand.png', className: 'cs-captain cs-captain-b', depth: -36},
      {art: 'pixel/explorer.png', className: 'cs-hero', depth: -60},
    ]},
  ],
  harbor_arrival: [
    {from: 0, to: 1, sky: 'harbor', layers: [
      {art: 'pixel/harbour-office.png', className: 'cs-office', depth: 18},
      {art: 'pixel/harbour-office-glow.png', className: 'cs-office', depth: 18},
      {art: 'pixel/explorer.png', className: 'cs-hero', depth: -50},
    ]},
  ],
  lock_opens: [
    {from: 0, to: 1, sky: 'night', layers: [
      {art: 'pixel/fog-bank.png', className: 'cs-fog cs-fog-back', depth: 30},
      {art: 'pixel/lighthouse.png', className: 'cs-lighthouse', depth: 12},
    ]},
    {from: 2, to: 3, sky: 'dusk', layers: [
      {art: 'pixel/lantern.png', className: 'cs-centre', depth: -10},
    ]},
  ],
  lamps_relit: [
    {from: 0, to: 0, sky: 'night', layers: [
      {art: 'pixel/festival-lamp-01-lit-night.png', className: 'cs-lamp cs-lamp-a', depth: 0},
      {art: 'pixel/festival-lamp-02-lit-night.png', className: 'cs-lamp cs-lamp-b', depth: 0},
      {art: 'pixel/festival-lamp-03-lit-night.png', className: 'cs-lamp cs-lamp-c', depth: 0},
    ]},
    {from: 1, to: 3, sky: 'dawn', layers: [
      {art: 'places/title.webp', className: 'cs-backdrop', depth: 50},
    ]},
  ],
};
