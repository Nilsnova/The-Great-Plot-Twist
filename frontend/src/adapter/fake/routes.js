// Public draft route metadata for the local fake. Card prose and reveal content are absent.
export const windows={ferry_in:{from:10,length:5},low_tide:{from:12,length:8},mail_boat:{from:15,length:5},shift_change:{from:0,length:8}};
const route=(id,cardId,spot,place,label,minutes,extra={})=>({id,cardId,spot,place,label,seconds:minutes*60,price:0,...extra});
export const routes=[
  route('C1.notice_board','C1','notice_board','saltreach_harbor','Read the reward notice',0),
  route('C2.radio_words','C2','satchel','anywhere','Remember the words through the door',0,{kit:'witness'}),
  route('C2.ferry_log_timed','C2','ferry_pier','saltreach_harbor','Wait for the ferry log',3,{window:'ferry_in'}),
  route('C2.ferry_log_paid','C2','ferry_pier','saltreach_harbor','Ask the ferry clerk now',3,{price:150}),
  route('C3.key_tag','C3','satchel','anywhere','Inspect the brass key',0),
  route('C4.back_room','C4','back_room','smugglers_cove','Show the red token',5,{kit:'informant'}),
  route('C4.low_tide_cave','C4','low_tide_cave','smugglers_cove','Search the cave at low tide',5,{window:'low_tide'}),
  route('C4.doorman_paid','C4','back_room','smugglers_cove','Ask the doorman for a look',8,{price:200}),
  route('C4.beach_crate','C4','home_driftline','home_islet','Inspect a washed-up crate',2,{playersOnly:true,worldCrate:true}),
  route('C5.yard_shift','C5','salvage_yard','wreck_point','Work a salvage-yard shift',15,{kit:'stranger'}),
  route('C5.yard_gate_timed','C5','yard_gate','wreck_point','Wait through the yard shift',15,{window:'shift_change'}),
  route('C5.dockhand_paid','C5','beach','wreck_point','Ask the dockhand for a copy',18,{price:250}),
  route('C6.back_room','C6','keepers_post_room','saltreach_harbor','Show the keeper’s permit',0,{kit:'true_keeper'}),
  route('C6.mail_boat_timed','C6','harbor_office','saltreach_harbor','Watch the mail sorting',3,{window:'mail_boat'}),
  route('C6.clerk_paid','C6','harbor_office','saltreach_harbor','Ask the day clerk now',3,{price:200}),
  route('C6.shareholder_register','C6','market_hall','saltreach_harbor','Read the shareholder register',3,{playersOnly:true,requiresShare:true}),
  route('C7.night_log','C7','signal_station','saltreach_harbor','Read the coastguard night log',0),
  route('C8.ruin','C8','watchtower_ruin','the_teeth','Search the old watchtower',9),
  route('C8.log_reader','C8','watchtower_ruin','the_teeth','Follow Elena’s log lead',4,{playersOnly:true,readLog:true}),
];
export const spotNames={jail:'Harbor jail',harbor_office_window:'Office window',reef:'Reef',satchel:'Your satchel',notice_board:'Reward notice',ferry_pier:'Ferry office',back_room:'Cove back room',low_tide_cave:'Low-tide cave',home_driftline:'Your driftline beach',salvage_yard:'Salvage yard',yard_gate:'Salvage-yard gate',beach:'Wreck beach dockhand',keepers_post_room:'Keepers’ post room',harbor_office:'Harbor Office counter',market_hall:'Shareholder register',signal_station:'Coastguard signal station',watchtower_ruin:'Watchtower ruin'};
export function windowStatus(now,id,arrivalMinutes=0) {
  const window=windows[id];if(!window)return {open:true,minutes:0};
  const openAt=minute=>{const phase=((minute%20)+20)%20;return phase>=window.from&&phase<window.from+window.length;};
  const minute=Math.floor(now/60)+arrivalMinutes;if(openAt(minute))return {open:true,minutes:0};
  for(let minutes=1;minutes<=20;minutes++)if(openAt(minute+minutes))return {open:false,minutes};
  return {open:false,minutes:20};
}
