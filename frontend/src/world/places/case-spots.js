// Registered world interaction to case-screen mapping. No card availability or case rules.
export const searchSpots=['notice_board','ferry_pier','back_room','low_tide_cave','salvage_yard','yard_gate','beach','keepers_post_room','harbor_office','market_hall','signal_station','watchtower_ruin','home_driftline','jail','harbor_office_window','reef'];
export function caseScreenFor(event) {
  if(event.id==='captains_table')return {screen:'board'};
  if(event.id==='lens_store'||event.id==='keepers_star')return {screen:'rewards'};
  if(event.id==='gulls_rest_dock')return {screen:'relighting'};
  if(event.id==='wall_of_lights')return {screen:'relighting'};
  if(['keepers_lamp','harbor_light','islet_signal_station'].includes(event.id))return {screen:'finale'};
  if(event.id==='fog_bank')return {screen:'accusation'};
  return searchSpots.includes(event.id)?{screen:'search',spot:event.id}:null;
}
