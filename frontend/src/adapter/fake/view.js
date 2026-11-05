// Fake view-model projection. Rule visibility and outcome labels are supplied here, not by screens.
import {accusationView,revealView} from './reveal.js';
import {worldView} from './relighting.js';
import {nightView} from './night.js';
import {searchView} from './search.js';
import {partnerView} from './partners.js';
import {boardView} from './board.js';
import {kits,cardTitles,suspectTitles,deductionData} from './data.js';
export function caseView(state) {
  const profile=state.profile,kit=profile?kits[profile.kitId]:null;
  return {schema:1,mode:'local',revision:state.revision,now:state.now,captain:{name:state.captainName,coins:profile?state.coins:null,save:{state:'local',label:'Saved · local rehearsal'}},
    arrival:{status:profile?'ready':'pending',title:profile?'Keep your story':'Your story is ready',endingLabel:profile?.ending==='ending_rescue'?'Rescue ending':'Tower ending',kit,coins:state.coins,items:kit?['Brass key','Oil lantern',kit.item]:[],readLog:!!profile?.readLog,logCard:profile?.readLog?{title:'Elena’s log',message:'A lead for the old watchtower. This entry cannot be pinned.'}:null,message:'Local fake · provisional case design. No server progress or coins are written.'},
    crew:state.crew?{...state.crew,joinPreview:state.joinPreview,seats:state.crew.seats.map(seat=>({...seat,kit:seat.kitId?kits[seat.kitId]:null,cards:(state.found[seat.seat]??[]).map(id=>({id,title:cardTitles[id]}))}))}:{status:'none',code:null,seats:Array.from({length:4},(_,i)=>({seat:i+1,kind:'open',name:'Open seat',kit:null,cards:[]})),joinPreview:state.joinPreview},
    board:boardView(state),
    permissions:{createCrew:!!profile&&!state.crew,joinCrew:!!profile&&!state.crew,muster:state.crew?.status==='forming'},search:searchView(state),partners:partnerView(state),finale:nightView(state),accusation:accusationView(state),reveal:revealView(state),
    world:worldView(state),effects:state.effects};
}
