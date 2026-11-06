// Requestable original crew/cast poses and story props. No narrative identity mapping.
export const characterIds = ['crew-deckhand','crew-navigator','crew-cook','crew-salvager',
  'character-harbor-master','character-masked-captain','character-fisherman','character-coastguard-commander','character-salvage-foreman','character-elena-vos'];
export const storyDimensions = {};
for (const id of characterIds) {
  for (const view of ['', '-back', '-side']) {
    storyDimensions[id+view] = [24,32,3];
    for (const step of [1,2]) storyDimensions[`${id}${view}-walk-${step}`] = [24,32,3];
  }
  storyDimensions[id+'-portrait'] = [64,80,0];
}
for (const name of ['wave','cheer','point','lantern','shrug']) storyDimensions[`emote-${name}`]=[24,24,0];
Object.assign(storyDimensions, {
  'lens-hall-open':[144,160,12], 'festival-lantern-string':[160,48,4], 'wall-of-lights-open':[128,96,8],
  'false-light':[96,96,12], 'ghost-schooner':[128,112,10], 'sealed-cargo':[64,64,8], 'anchor-eye-seal':[32,32,0],
  'torn-logbook-page':[48,64,4], 'lighthouse-lens':[48,64,8], 'keepers-star':[32,32,4],
  'wall-lights-plaque':[128,64,4], 'captains-board':[320,192,0], 'clue-frame-new':[144,192,0],
  'clue-frame-pinned':[144,192,0], 'clue-frame-used':[144,192,0], 'coin-icon':[16,16,0], 'wallet-icon':[24,24,0],
});
export function characterArtIds(id) {
  if (!characterIds.includes(id)) throw new Error(`Unknown character art: ${id}`);
  return ['', '-back', '-side'].flatMap(view => [id+view,...[1,2].map(step=>`${id}${view}-walk-${step}`)]);
}
// Reuse createCharacter with a selected NPC's already-loaded materials.
export function characterArt(art,id) {
  return Object.fromEntries(characterArtIds(id).map(name=>{
    if (!Object.hasOwn(art,name)) throw new Error(`Load character pose first: ${name}`);
    return ['explorer'+name.slice(id.length),art[name]];
  }));
}
