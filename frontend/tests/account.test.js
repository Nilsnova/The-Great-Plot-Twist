import {describe,it,expect} from 'vitest';
import {
  initialAccountState,accountView,settleAccount,signIn,signOut,rerollName,deleteMyData,
} from '../src/adapter/fake/account.js';

function state(){return {lobbyNow:0,captainName:'Captain Lantern',coins:null,account:initialAccountState()};}
function signedIn(s){s.account.state='signed_in';}

describe('fake account state',()=>{
  it('projects a signed-out account without inventing a captain or progress',()=>{
    const s=state(),view=accountView(s);
    expect(view.state).toBe('signed_out');expect(view.captainName).toBe('Captain Lantern');
    expect(view.canReroll).toBe(false);expect(view.guest).toBe(false);expect(view.providers).toEqual(['github']);
    expect(view).not.toHaveProperty('save');expect(view).not.toHaveProperty('hasKit');
  });

  it('acknowledges sign-in immediately and settles it on lobby time',()=>{
    const s=state(),result=signIn(s);
    expect(result.accepted).toBe(true);expect(s.account.state).toBe('signing_in');expect(accountView(s).state).toBe('signing_in');
    expect(signIn(s).reason).toBe('busy');
    s.lobbyNow+=0.49;expect(settleAccount(s)).toBe(false);expect(s.account.state).toBe('signing_in');
    s.lobbyNow+=0.01;expect(settleAccount(s)).toBe(true);expect(s.account.state).toBe('signed_in');
    s.lobbyNow+=3600;expect(settleAccount(s)).toBe(true);expect(s.account.state).toBe('expired');
  });

  it('allows a one-time captain name reroll',()=>{
    const s=state();signedIn(s);
    const first=rerollName(s);expect(first.accepted).toBe(true);expect(s.captainName).not.toBe('Captain Lantern');expect(accountView(s).captainName).toBe(s.captainName);expect(accountView(s).canReroll).toBe(false);
    expect(rerollName(s).reason).toBe('name_reroll_used');
  });

  it('refuses account changes while signed out and signs out an expired session',()=>{
    const s=state();
    expect(rerollName(s).reason).toBe('offline');
    s.account.state='expired';expect(rerollName(s).reason).toBe('session_expired');
    expect(signOut(s).accepted).toBe(true);expect(accountView(s).state).toBe('signed_out');
  });

  it('requires the screen confirmation flag and clears this player',()=>{
    const s=state();signedIn(s);s.coins=100;s.captainName='Captain Reed';
    expect(deleteMyData(s,{confirm:false}).reason).toBe('confirmation_required');
    expect(deleteMyData(s,{confirm:true}).accepted).toBe(true);
    expect(s.coins).toBe(0);expect(s.captainName).toBe('Captain Lantern');expect(s.account.state).toBe('signed_out');
  });
});
