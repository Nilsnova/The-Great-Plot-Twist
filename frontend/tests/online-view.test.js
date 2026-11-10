// Placeholder DTOs prove the real projection without transport or secrets.
import {describe,it,expect} from 'vitest';
import {composeRealView} from '../src/online/adapter/view.js';
import {mapAccount} from '../src/online/adapter/account-view.js';
import {viewKeys} from '../src/adapter/contract.js';
import {kits,kitDisplay,kitArchetype} from '../src/adapter/shared/kits.js';

const me={id:'private-player',displayName:'private-login',captainName:'Captain Example',coins:27,
  kit:'witness',place:'saltreach_harbor',crews:[{id:'private-crew'}]};
const signed={accountState:'signed_in',me,nameReply:{captainName:'Captain Example',rerollsLeft:1}};

describe('real view projection',()=>{
  it('starts with exactly the schema keys and no case sections',()=>{
    const view=composeRealView();
    expect(Object.keys(view).sort()).toEqual([...viewKeys].sort());
    expect(view).toMatchObject({schema:1,mode:'online',revision:0,now:0,captain:{coins:null}});
    expect(view.presence.status).toBe('off');
    for(const key of ['board','reveal','crew','bulletin','rewards','continuation','arrival'])expect(view).not.toHaveProperty(key);
  });
  it('returns owned nested snapshots and never exposes real identifiers',()=>{
    const first=composeRealView(signed);
    first.account.providers.push('changed');first.captain.name='changed';
    expect(composeRealView(signed).account.providers).toEqual(['github']);
    expect(composeRealView(signed).captain.name).toBe('Captain Example');
    expect(JSON.stringify(composeRealView(signed))).not.toContain('private-');
  });
  it('maps captain data and the exact reroll availability',()=>{
    expect(composeRealView(signed).captain).toEqual({name:'Captain Example',coins:27});
    expect(mapAccount(signed)).toMatchObject({canReroll:true,captainName:'Captain Example'});
    expect(mapAccount(signed)).not.toHaveProperty('save');expect(mapAccount(signed)).not.toHaveProperty('hasKit');
    expect(mapAccount({...signed,nameReply:{rerollsLeft:0}}).canReroll).toBe(false);
    expect(composeRealView({...signed,accountState:'signed_out'}).captain.coins).toBeNull();
    expect(composeRealView({accountState:'signed_in',me:{coins:0}}).captain.coins).toBe(0);
  });
  it('lists the configured sign-in providers and GitHub when the list is missing',()=>{
    expect(mapAccount({config:{auth:{providers:['email','github','other']}}}).providers).toEqual(['email','github']);
    expect(mapAccount({}).providers).toEqual(['github']);
  });
  it('shares display names and art only, with no kit grants or item rules',()=>{
    expect(Object.keys(kits.witness).sort()).toEqual(['archetype','id','name']);
    expect(kitDisplay('witness')).toEqual({id:'witness',name:'Witness'});
    expect(kitArchetype('true_keeper')).toBe('navigator');
    expect(kitArchetype('unknown')).toBeNull();
  });
});
