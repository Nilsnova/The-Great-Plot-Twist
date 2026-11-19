// The source already committed free revival: later helper state cannot discard or teleport its restore.
import {it,expect} from 'vitest';
import {createCaptains} from '../../src/pirates/sim-captains.js';
import {CONFIG} from '../../src/pirates/sim.js';
import {captainStats} from '../../src/pirates/captain-stats.js';
import {simulationInputFromJournal} from '../../src/pirates/recovery-transport.js';
const helper='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',target='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',fall='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(skills=[]){
 const loadout={level:1,skills,weapon:'musket'},party=new Map([[helper,{id:helper,x:50,z:60,hp:0,maxHp:100,down:true,downAt:1,reviveBasisSeq:0}],
  [target,{id:target,x:1,z:2,hp:0,maxHp:100,down:true,downAt:.1,fallId:fall,reviveBasisSeq:0}]]);
 const sim={C:CONFIG,H:CONFIG.health,party,canonicalCaptains:{[helper]:{},[target]:{}},canonicalLoadouts:{[helper]:loadout,[target]:{level:1,skills:[],weapon:'musket'}},
  captainStatsFor:captainStats,now:()=>2,ticks:40,finisher:{active:false},rescue:{active:false}};
 const event={serverSeq:7,effectiveTick:40,type:'captain_revive',participantToken:helper,payload:{operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',targetId:target,fallId:fall,
  holdId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',captain:loadout,command:{type:'captain_revive',targetId:target,downAt:2,x:0,z:0}}};
 return {party,event,apply:createCaptains(sim).applyInput};
}
it.each([[[],50],[['medic'],75],[['medic','field_surgeon'],100]])('applies the committed frozen restore once after helper fell/moved, with skills %j',(skills,hp)=>{
 const f=fixture(skills),events=[];f.apply(simulationInputFromJournal(f.event),events);
 expect(f.party.get(target)).toMatchObject({hp,down:false,downAt:null,reviveBasisSeq:7});expect(f.party.get(helper)).toMatchObject({x:50,z:60,down:true});
 f.apply(simulationInputFromJournal(f.event),events);expect(events).toHaveLength(1);
});
it.each(['fall','withdrawn','helper','loadout','marker'])('refuses mismatched native %s evidence',kind=>{
 const f=fixture();if(kind==='fall')f.party.get(target).fallId='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if(kind==='withdrawn')f.party.get(target).withdrawn=true;if(kind==='helper')f.event.participantToken='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if(kind==='loadout')f.event.payload.captain={level:5,skills:['medic'],weapon:'musket'};if(kind==='marker')f.event.payload.holdId='forged';
 f.apply(simulationInputFromJournal(f.event),[]);expect(f.party.get(target).hp).toBe(0);
});
