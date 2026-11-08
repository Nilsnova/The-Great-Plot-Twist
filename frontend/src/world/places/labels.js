// Public place labels for network-only views, without loading world geometry or Three.js.
export const placeLabels = Object.freeze({
  lighthouse_isle: 'Lighthouse Isle',
  saltreach_harbor: 'Saltreach Harbor',
  home_islet: 'Home islet',
  smugglers_cove: 'Smugglers’ Cove',
  wreck_point: 'Wreck Point',
  the_teeth: 'The Teeth',
  gulls_rest: 'Gull’s Rest',
});

export function placeLabel(id) {
  return Object.hasOwn(placeLabels, id) ? placeLabels[id] : null;
}
