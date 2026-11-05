import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {
  initialAccountState,accountView,settleAccount,signIn,signOut,rerollName,
  deleteMyData,resolveSaveConflict,continueGame,syncAccountSave,
} from '../src/adapter/fake/account.js';

function state(){return {...initialCaseState(),account:initialAccountState()};}
function localIntro(s){s.profile={ending:'ending_rescue',kitId:'true_keeper',readLog:true,actions:['warn_harbor','read_log']};s.coins=1000;}
function signedIn(s){s.account.state='signed_in';}

describe('fake account and save state',()=>{
  it('projects a signed-out account and each save source without inventing continuation',()=>{
    const s=state(),view=accountView(s);
    expect(view.state).toBe('signed_out');expect(view.captainName).toBe('Captain Lantern');
    expect(view.hasKit).toBe(false);expect(view.canContinue).toBe(false);expect(view.save.device.state).toBe('idle');expect(view.save.cloud.state).toBe('idle');
    expect(view.save.updatedAt).toBeNull();
  });

  it('acknowledges sign-in immediately and settles it on lobby time',()=>{
    const s=state(),result=signIn(s);
    expect(result.accepted).toBe(true);expect(s.account.state).toBe('signing_in');expect(accountView(s).state).toBe('signing_in');
    s.lobbyNow+=0.49;expect(settleAccount(s)).toBe(false);expect(s.account.state).toBe('signing_in');
    s.lobbyNow+=0.01;expect(settleAccount(s)).toBe(true);expect(s.account.state).toBe('signed_in');
  });

  it('allows a one-time captain name reroll and updates the local crew seat',()=>{
    const s=state();signedIn(s);s.crew={status:'forming',leaderSeat:1,seats:[{seat:1,kind:'player',name:s.captainName,isYou:true},{seat:2,kind:'open',name:'Open seat'}]};
    const first=rerollName(s);expect(first.accepted).toBe(true);expect(s.captainName).not.toBe('Captain Lantern');expect(s.crew.seats[0].name).toBe(s.captainName);expect(accountView(s).canReroll).toBe(false);
    expect(rerollName(s).reason).toBe('name_reroll_used');
  });

  it('keeps accepted device intro actions when a session expires or signs out',()=>{
    const s=state();localIntro(s);s.account.state='expired';
    expect(accountView(s).state).toBe('expired');expect(accountView(s).canContinue).toBe(true);
    expect(signOut(s).accepted).toBe(true);expect(accountView(s).state).toBe('signed_out');
    const result=continueGame(s);expect(result.accepted).toBe(true);expect(s.continuation).toEqual({source:'local',kind:'intro',actions:['warn_harbor','read_log'],place:'lighthouse_isle'});
    expect(s.profile).not.toBeNull();
  });

  it('continues signed-out players through the local intro even when their kit is confirmed',()=>{
    const s=state();s.profile={ending:'ending_rescue',kitId:'true_keeper',readLog:true,actions:['warn_harbor','read_log'],place:'saltreach_harbor'};
    syncAccountSave(s);
    expect(accountView(s).hasKit).toBe(true);expect(accountView(s).canContinue).toBe(true);
    expect(continueGame(s).accepted).toBe(true);
    expect(s.continuation).toEqual({source:'local',kind:'intro',actions:['warn_harbor','read_log'],place:'saltreach_harbor'});
    expect(s.profile.kitId).toBe('true_keeper');
  });

  it.each([
    ['keep_this_device','local',['warn_harbor','read_log'],'lighthouse_isle'],
    ['use_cloud','cloud',['warn_harbor','read_log','read_log'],'saltreach_harbor'],
  ])('resolves a save conflict with %s and continues from the selected source',async(choice,source,actions,place)=>{
    const s=state();localIntro(s);signedIn(s);
    s.account.saveState='conflict';s.account.deviceSave={state:'saved',label:'Saved on this device',updatedAt:'2026-11-05T10:00:00.000Z',kind:'intro',actions:['warn_harbor','read_log'],place:'lighthouse_isle'};
    s.account.cloudSave={state:'saved',label:'Cloud save',updatedAt:'2026-11-05T10:01:00.000Z',kind:'intro',actions:['warn_harbor','read_log','read_log'],place:'saltreach_harbor'};
    const resolved=await resolveSaveConflict(s,choice);expect(resolved.accepted).toBe(true);expect(accountView(s).save.state).toBe('saved');
    const continued=await continueGame(s);expect(continued.accepted).toBe(true);expect(s.continuation).toEqual({source,kind:'intro',actions,place});
  });

  it('prefers cloud by default when signed in with both saves, while honoring an explicit device conflict choice',()=>{
    const s=state();localIntro(s);signedIn(s);
    s.account.deviceSave={state:'saved',label:'Saved on this device',updatedAt:'2026-11-05T10:00:00.000Z',kind:'intro',actions:['warn_harbor'],place:'lighthouse_isle'};
    s.account.cloudSave={state:'saved',label:'Cloud save',updatedAt:'2026-11-05T10:01:00.000Z',kind:'intro',actions:['read_log'],place:'saltreach_harbor'};
    expect(accountView(s).save.source).toBe('cloud');
    expect(continueGame(s).accepted).toBe(true);
    expect(s.continuation).toEqual({source:'cloud',kind:'intro',actions:['read_log'],place:'saltreach_harbor'});

    s.account.saveState='conflict';
    expect(resolveSaveConflict(s,'keep_this_device').accepted).toBe(true);
    expect(accountView(s).save.source).toBe('device');
    expect(continueGame(s).accepted).toBe(true);
    expect(s.continuation).toEqual({source:'local',kind:'intro',actions:['warn_harbor'],place:'lighthouse_isle'});
    expect(s.profile.kitId).toBe('true_keeper');
  });

  it('refuses an unsupported save choice and keeps the conflict unresolved',()=>{
    const s=state();signedIn(s);s.account.saveState='conflict';
    expect(resolveSaveConflict(s,'latest').reason).toBe('unsupported_choice');expect(accountView(s).save.state).toBe('conflict');
  });

  it('uses state-owned save timestamps, not the case view clock',()=>{
    const s=state();localIntro(s);s.account.deviceSave={state:'saved',label:'Saved on this device',updatedAt:'2026-11-05T09:30:00.000Z',kind:'intro',actions:s.profile.actions,place:'lighthouse_isle'};
    s.now=999999;expect(accountView(s).save.device.updatedAt).toBe('2026-11-05T09:30:00.000Z');
  });

  it('projects accepted profile progress into a memory-only cloud save summary',()=>{
    const s=state();s.profile={kitId:'true_keeper',actions:['warn_harbor'],place:'saltreach_harbor'};
    expect(syncAccountSave(s)).toBe(true);
    expect(s.account.cloudSave).toEqual({state:'saved',label:'Cloud progress saved',updatedAt:s.account.stableDate,kind:'world',actions:['warn_harbor'],place:'saltreach_harbor'});
    expect(s.account.saveState).toBe('saved');expect(accountView(s).save.cloud.label).toBe('Cloud progress saved');
    s.profile.actions.push('read_log');expect(s.account.cloudSave.actions).toEqual(['warn_harbor']);
  });

  it('requires the screen confirmation flag and clears only this player while passing crew leadership',()=>{
    const s=state();localIntro(s);signedIn(s);s.account.deviceSave={state:'saved',label:'Saved on this device',updatedAt:'2026-11-05T09:30:00.000Z',kind:'intro',actions:s.profile.actions,place:'lighthouse_isle'};
    s.found[1]=['C1','C2'];s.found[2]=['C3'];s.pins=[{cardId:'C1',seat:1},{cardId:'C3',seat:2}];s.creditedCards=['C1'];s.deductions=['D1'];
    s.crew={status:'active',leaderSeat:1,seats:[{seat:1,kind:'player',name:s.captainName,isYou:true},{seat:2,kind:'player',name:'Captain Shoal'},{seat:3,kind:'npc',name:'Cook partner'},{seat:4,kind:'open',name:'Open seat'}]};
    expect(deleteMyData(s,{confirm:false}).reason).toBe('confirmation_required');
    expect(deleteMyData(s,{confirm:true}).accepted).toBe(true);
    expect(s.profile).toBeNull();expect(s.coins).toBe(0);expect(s.account.state).toBe('signed_out');expect(s.account.deviceSave.state).toBe('idle');
    expect(s.crew.leaderSeat).toBe(2);expect(s.crew.seats[0].kind).toBe('open');expect(s.crew.seats[1].name).toBe('Captain Shoal');
    expect(s.found[1]).toEqual([]);expect(s.found[2]).toEqual(['C3']);expect(s.pins).toEqual([{cardId:'C3',seat:2}]);expect(s.deductions).toEqual(['D1']);
  });
});
