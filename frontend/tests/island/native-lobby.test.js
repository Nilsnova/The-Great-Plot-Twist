// Old room leadership/absence is display-only for native islands; canonical session metadata controls.
import {it,expect,vi} from 'vitest';
import {createGames} from '../../src/island/island-game.js';
import {economy,actorId} from './shared-session-fixture.js';
it('ignores legacy hostAway/game_state and uses only the current canonical leader for the bell entry',()=>{
 let manage=false,selected=economy();const game={start:vi.fn(()=>true),state:{code:'K7Q2M',members:[],me:actorId,hostId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',hostAwayMs:999999,started:true}};
 const isl={mode:'live',own:{code:'ISLE-K7Q2M'},game,getEconomy:()=>selected,pick:vi.fn(),refreshCard:vi.fn(),ui:{close:vi.fn()},session:{get settingsView(){return {canManage:manage};}}};
 const part=createGames(isl);Object.assign(isl,part);part.link();expect(part.lobby().start).toMatchObject({disabled:true,label:'Open harbor bell'});part.startGame();expect(game.start).not.toHaveBeenCalled();
 manage=true;expect(part.lobby().start.disabled).toBe(false);part.startGame();expect(isl.pick).toHaveBeenCalledExactlyOnceWith('island_bell');expect(game.start).not.toHaveBeenCalled();
 selected={mode:'personal_legacy',version:0,islandOwner:actorId,accountId:null,runEpoch:null,revision:null,treasury:null};part.startGame();expect(game.start).toHaveBeenCalledOnce();
});
