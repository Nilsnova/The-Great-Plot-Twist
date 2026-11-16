// The bus events that move the first-3-minutes quest strip (BUILD-PLAN.md section 3.6). Other lanes
// import these names and emit them on the game's event bus (src/core/events.js):
//   import {emit} from '../core/events.js';
//   import {QUEST_EVENTS} from '../ui/quest-events.js';
//   emit({type: QUEST_EVENTS.ISLAND_BUILT, kind: 'cannon'});
// Payloads (extra fields are ignored; a wrong payload simply does not count):
//   island_built          {kind}       a building finished on the player's own island: 'wall', 'cannon', 'mortar', 'watchtower', 'house'
//   island_upgraded       {kind, level} a building on the player's own island went up a level (TOWER-DEFENSE.md §2)
//   crew_hired            {crew}       a gunner, carpenter or lookout was hired (§3)
//   wave_finished         {survived, wave?, waveBest?}  a pirate wave ended; survived is true when the island held
//   place_arrived         {id}         the player arrived at a place id from src/world/places/registry.js
//   harbor_stake_placed   {}           a 🪙 stake was placed at a Harbor stall (the market stall or the match board)
//   island_invite_opened  {}           the player opened "Invite a friend" (island code + QR)
// The guided start of a new island (T52, GUIDE_STEPS in first-quests.js) also listens to:
//   player_moved          {}           this player walked a few steps (src/tutorial/tutorials.js, from the frame)
//   build_card_opened     {}           a build spot's card opened on this screen (src/tutorial/tutorials.js)
//   hud_opened            {what}       the Menu ('menu') or the goals strip ('goals') was opened (src/ui/hud.js)
//   wave_controller_started {wave}     a wave began on this screen (src/pirates/controller.js)
//   captain_attack        {weapon}     this player fired their gun ('gun') or swung the cutlass ('cutlass') (controller.js)
//   boarders_ashore       {wave}       the first boarders of a wave landed (controller.js)
export const ISLAND_BUILT = 'island_built';
export const WAVE_FINISHED = 'wave_finished';
export const PLACE_ARRIVED = 'place_arrived';
export const HARBOR_STAKE_PLACED = 'harbor_stake_placed';
export const ISLAND_INVITE_OPENED = 'island_invite_opened';
export const ISLAND_UPGRADED = 'island_upgraded';
export const CREW_HIRED = 'crew_hired';
export const QUEST_EVENTS = Object.freeze({ISLAND_BUILT, WAVE_FINISHED, PLACE_ARRIVED, HARBOR_STAKE_PLACED, ISLAND_INVITE_OPENED, ISLAND_UPGRADED, CREW_HIRED});
export const PLAYER_MOVED = 'player_moved';
export const BUILD_CARD_OPENED = 'build_card_opened';
export const HUD_OPENED = 'hud_opened';
export const WAVE_BEGAN = 'wave_controller_started';
export const CAPTAIN_ATTACK = 'captain_attack';
export const BOARDERS_ASHORE = 'boarders_ashore';
export const GUIDE_EVENTS = Object.freeze({PLAYER_MOVED, BUILD_CARD_OPENED, HUD_OPENED, WAVE_BEGAN, CAPTAIN_ATTACK, BOARDERS_ASHORE, ISLAND_BUILT, WAVE_FINISHED});
