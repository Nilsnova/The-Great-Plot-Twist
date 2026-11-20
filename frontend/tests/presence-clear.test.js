// An explicit unlocated source clears one local cosmetic route; it cannot carry position fields.
import {it,expect,vi} from 'vitest';
import {validateIntent} from '../src/online/adapter/validate.js';
import {initialPresenceState,presenceView,reportPosition} from '../src/adapter/fake/presence.js';
import {createWorldExperience} from '../src/world/experience.js';
it('accepts only the exact clear form and clears the fake public peer projection',()=>{
 expect(validateIntent('reportPosition',[{place:null}])).toBeNull();
 for(const sample of [{place:null,x:0},{place:null,moving:false},null,[]])expect(validateIntent('reportPosition',[sample])?.accepted).toBe(false);
 const state=initialPresenceState();expect(reportPosition(state,{place:null}).accepted).toBe(true);expect(presenceView(state)).toMatchObject({place:null,others:[],localEmote:null});
 expect(reportPosition(state,{place:null,x:0}).accepted).toBe(false);
});
it('sends one clear per explicit-null transition and never reports a default island position',()=>{
 let place=null;const send=vi.fn(),experience=createWorldExperience({send,world:{current:{id:'home_islet'}},player:{position:{x:1,z:2}},preferences:()=>({}),presencePlace:()=>place});
 experience.apply({captain:{coins:null},presence:{status:'off',localEmote:null}});experience.update(.05);experience.update(.05);
 expect(send).toHaveBeenCalledExactlyOnceWith('reportPosition',{place:null});place='isle_k7q2m_0123456789abcdef01234567';experience.update(.05);place=null;experience.update(.05);
 expect(send.mock.calls).toEqual([['reportPosition',{place:null}],['reportPosition',{place:null}]]);experience.dispose();
});
