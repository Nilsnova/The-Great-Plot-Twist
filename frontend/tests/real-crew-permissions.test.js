// Crew availability follows the published A6 membership states, without selecting seats or kits.
import {describe,expect,it} from 'vitest';
import {crewPermissions} from '../src/online/case-adapter/crew-permissions.js';
import {mapCrew} from '../src/online/case-adapter/crew-view.js';

const account={state:'signed_in',hasKit:true};
const draft={status:'forming',mode:'solo',mySeat:1,seats:[
  {seatNo:1,holder:'player',name:'Placeholder captain',kit:'witness',isMe:true},
  ...[2,3,4].map(seatNo=>({seatNo,holder:'open',name:null,kit:null,isMe:false})),
]};
describe('real crew permissions',()=>{
  it('allows a kit holder to make or join a new crew',()=>{
    expect(crewPermissions({crew:null},account)).toEqual({createCrew:true,joinCrew:true,muster:false});
  });
  it('allows an owned one-player forming draft to join another crew',()=>{
    expect(crewPermissions({crew:draft},account)).toEqual({createCrew:false,joinCrew:true,muster:true});
  });
  it('allows any player in a forming crew to muster, not only seat one',()=>{
    const crew={...draft,mode:'crew',mySeat:2,seats:[{...draft.seats[0],isMe:false},
      {...draft.seats[0],seatNo:2,isMe:true},...draft.seats.slice(2)]};
    expect(crewPermissions({crew},account)).toEqual({createCrew:false,joinCrew:false,muster:true});
  });
  it('does not treat another seat or an active solo crew as an abandonable draft',()=>{
    expect(crewPermissions({crew:{...draft,mySeat:2}},account).joinCrew).toBe(false);
    expect(crewPermissions({crew:{...draft,status:'active'}},account)).toEqual({createCrew:false,joinCrew:false,muster:false});
  });
  it('lets a finished-crew player start again while leaving muster unavailable',()=>{
    expect(crewPermissions({crew:{...draft,status:'finished'}},account))
      .toEqual({createCrew:true,joinCrew:true,muster:false});
  });
  it.each([{state:'expired',hasKit:true},{state:'signed_out',hasKit:true},{state:'signed_in',hasKit:false}])(
    'keeps crew changes unavailable without both sign-in and a confirmed kit',value=>{
      expect(crewPermissions({crew:draft},value)).toEqual({createCrew:false,joinCrew:false,muster:false});
    });
  it('projects four ordered seats and strips private identifiers',()=>{
    const crew={...draft,id:'private-crew-id',code:'CODE22',status:'finished',seats:[
      {...draft.seats[0],playerId:'private-player-id'},
      {seatNo:2,holder:'player',name:'Placeholder friend',kit:'stranger',isMe:false},
      {seatNo:3,holder:'partner',name:'Placeholder partner',kit:'informant',partnerId:'private-partner-id'},
      draft.seats[3],
    ]};
    const view=mapCrew({crew});
    expect(view.status).toBe('finished');expect(view.seats.map(seat=>seat.seat)).toEqual([1,2,3,4]);
    expect(view.seats.map(seat=>seat.kind)).toEqual(['player','player','npc','open']);
    expect(view.seats[0]).toMatchObject({isYou:true,kit:{id:'witness',name:'Witness'},archetype:'cook'});
    expect(view.seats[2]).toMatchObject({kit:{id:'informant',name:'Informant'},archetype:'salvager'});
    expect(JSON.stringify(view)).not.toContain('private-');
  });
});
