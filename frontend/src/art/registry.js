// Which cartoon drawings exist and where their code lives. The island's people, scenery and
// buildings load with the game; the fleet (ships, shots, smoke, splashes, explosions) is its own
// chunk, imported only when a wave's atlas is drawn. Every frame: [width, height, anchor, draw].
import {peopleFrames} from './people.js';
import {islandFrames} from './island.js';
import {campaignFrames} from './campaign.js';
import {extraFrames} from './extras.js';

let local = null;
const island = () => (local ??= {...peopleFrames(), ...islandFrames(), ...campaignFrames(), ...extraFrames()});
let fleet = null;
const FLEET = /^(pirate-|fx-)/;
/** True when a cartoon drawing exists for the frame name (fleet names are known by their prefix). */
export function hasCartoon(name) { return Object.hasOwn(island(), name) || FLEET.test(name); }
/** The island frames, synchronously (people, scenery, buildings). */
export function islandFrame(name) { return island()[name] ?? null; }
/** Every drawing for the names, loading the fleet chunk when one of them needs it. */
export async function framesFor(names) {
  if (names.some(name => !Object.hasOwn(island(), name) && FLEET.test(name)))
    fleet ??= import('./fleet.js').then(module => module.fleetFrames());
  const ships = fleet ? await fleet : {};
  return Object.fromEntries(names.map(name => [name, island()[name] ?? ships[name] ?? null]).filter(([, frame]) => frame));
}
/** World sizes [width, height, anchor share] of every island frame, as the pixel catalog keeps them. */
export function islandSizes() {
  return Object.fromEntries(Object.entries(island()).map(([name, [w, h, anchor]]) => [name, [w / 16, h / 16, anchor / h]]));
}
