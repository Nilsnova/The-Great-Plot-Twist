// Read callback suppression is narrow: canonical money and accepted arsenal domain must both agree.
import {it,expect,vi} from 'vitest';
import {createArsenal} from '../../src/island/arsenal.js';
import {data,economy,ACTOR,id} from './shared-arsenal-fixture.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let selected=economy(),actor=ACTOR;const api={state:vi.fn(async()=>({ok:true,data:data()}))};
 const onEconomy=vi.fn(),onCoins=vi.fn(),emit=vi.fn(),ui={open:'arsenal',arsenalCard:vi.fn(),toast:vi.fn()};
 const arsenal=createArsenal({api,ui,enabled:()=>true,getEconomy:()=>selected,getActorId:()=>actor,onEconomy,onCoins,emit});
 return {api,arsenal,onEconomy,onCoins,ui,emit,setEconomy:value=>{selected=value;},setActor:value=>{actor=value;}};
}
it('keeps every duplicate read and inventory adoption without reprojecting unchanged shared funds',async()=>{
 const f=fixture();await f.arsenal.refresh();expect(f.onEconomy).toHaveBeenCalledOnce();f.onEconomy.mockClear();f.ui.arsenalCard.mockClear();
 await f.arsenal.refresh();await f.arsenal.refresh();
 expect(f.api.state).toHaveBeenCalledTimes(3);expect(f.arsenal.answer).toEqual(data());expect(f.ui.arsenalCard).toHaveBeenCalled();
 expect(f.onEconomy).not.toHaveBeenCalled();expect(f.onCoins).not.toHaveBeenCalled();
});
it('compares incoming money to the current canonical view after construction, rather than the old arsenal envelope',async()=>{
 const f=fixture();await f.arsenal.refresh();f.onEconomy.mockClear();
 const next={...economy(),revision:'2',treasury:{balanceCoins:'100',committedCoins:'0',availableCoins:'100'}};
 f.setEconomy(next);f.api.state.mockResolvedValue({ok:true,data:{...data(),economy:next}});await f.arsenal.refresh();
 expect(f.onEconomy).not.toHaveBeenCalled();expect(f.arsenal.answer.economy).toEqual(next);
});
it.each(['revision','holder','generation','price','wave','money','conflicting-money','origin','actor'])('keeps the callback for changed %s facts',async change=>{
 const f=fixture();await f.arsenal.refresh();f.onEconomy.mockClear();const next=data();
 if(change==='revision')next.arsenalRevision='2';
 if(change==='holder')next.copies[0].holderName='Captain Tern';
 if(change==='generation')next.copies[0].holderGeneration='2';
 if(change==='price')next.types[1].priceCoins='61';
 if(change==='wave')next.waveRunning=true;
 if(change==='money')next.economy={...economy(),revision:'2'};
 if(change==='conflicting-money')next.economy={...economy(),treasury:{balanceCoins:'100',committedCoins:'0',availableCoins:'100'}};
 if(change==='origin'){next.economy={...economy(id(90)),accountId:id(91)};f.setEconomy(next.economy);}
 if(change==='actor')f.setActor(id(99));
 f.api.state.mockResolvedValue({ok:true,data:next});await f.arsenal.refresh();expect(f.onEconomy).toHaveBeenCalledOnce();
});
it.each(['buy','take','giveBack'])('preserves unchanged %s write/replay projection and existing events',async action=>{
 const f=fixture();await f.arsenal.refresh();f.onEconomy.mockClear();
 f.api[action]=vi.fn(async()=>({ok:true,data:data(),receipt:{},repeat:true}));
 f.arsenal.handlers[action](action==='buy'?'pistols':id(5));await settle();
 expect(f.onEconomy).toHaveBeenCalledOnce();expect(f.api[action]).toHaveBeenCalledOnce();
 expect(f.emit.mock.calls.map(([event])=>event.type)).toEqual(['island_spots_changed','arsenal_changed']);
});
