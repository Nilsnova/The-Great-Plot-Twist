// First-time help follows supplied permissions and stores only fixed device preference IDs.
import {describe,it,expect} from 'vitest';
import {onboardingHints,ONBOARDING_IDS} from '../src/shell/hints/onboarding-logic.js';
import {createOnboardingState} from '../src/shell/hints/onboarding-state.js';
import {loadPreferences,savePreferences,PREFERENCES_KEY} from '../src/settings/logic.js';

const signedOut=()=>({mode:'online',account:{state:'signed_out',canSignIn:true,hasKit:false},
  crew:{status:'none'},permissions:{},board:{cards:[]},finale:{}});
const signedIn=()=>({...signedOut(),account:{state:'signed_in',canSignIn:true,hasKit:false},arrival:{status:'pending'}});
const active=()=>({...signedIn(),account:{state:'signed_in',canSignIn:true,hasKit:true},
  crew:{status:'active',mySeat:1},permissions:{createCrew:false,joinCrew:false,muster:false}});
const settle=state=>{for(let i=0;i<21;i++)state.tick(.1);return state.read();};

describe('first-time hint selection',()=>{
  it('offers sign-in only when the connected view explicitly allows it',()=>{
    expect(onboardingHints(signedOut())[0]).toMatchObject({id:'onboarding-sign-in',action:'account'});
    for(const state of ['signing_in','expired','error']){
      expect(onboardingHints({...signedOut(),account:{...signedOut().account,state}})).toEqual([]);
    }
    expect(onboardingHints({...signedOut(),mode:'unavailable'})).toEqual([]);
    expect(onboardingHints({...signedOut(),mode:'local'})).toEqual([]);
    expect(onboardingHints({...signedOut(),account:{state:'signed_out',canSignIn:false}})).toEqual([]);
    expect(onboardingHints({mode:'online',account:{state:'signed_out'}})).toEqual([]);
  });
  it('waits for the completed story and a pending arrival before offering the kit action',()=>{
    expect(onboardingHints(signedIn())).toEqual([]);
    expect(onboardingHints(signedIn(),{introComplete:true})[0]).toMatchObject({id:'onboarding-kit',action:'arrival'});
    expect(onboardingHints({...signedIn(),arrival:null},{introComplete:true})).toEqual([]);
    expect(onboardingHints({...signedIn(),arrival:{status:'ready'}},{introComplete:true})).toEqual([]);
    expect(onboardingHints({...signedIn(),account:{state:'signed_in'}})).toEqual([]);
  });
  it('shows crew setup only with a supplied crew action',()=>{
    const view={...signedIn(),account:{...signedIn().account,hasKit:true}};
    expect(onboardingHints(view)).toEqual([]);
    expect(onboardingHints({...view,permissions:{joinCrew:true}})[0]).toMatchObject({id:'onboarding-crew',action:'crew'});
    expect(onboardingHints({...view,crew:{status:'forming'},permissions:{muster:true}})[0].body).toContain('NPC');
    expect(onboardingHints({...view,crew:{status:'finished'},permissions:{createCrew:true}})).toEqual([]);
  });
  it('uses only a ready station action and the caller’s first earned pin',()=>{
    const view=active();view.finale={islet:{id:'islet_signal_station',built:false,canBuild:true}};
    view.board={cards:[{id:'generic-clue',canPin:true,pinnedBy:[]}]};
    expect(onboardingHints(view).map(hint=>hint.id)).toEqual(['onboarding-station','onboarding-pin']);
    expect(onboardingHints({...view,finale:{islet:{...view.finale.islet,canBuild:false}}}).map(hint=>hint.id)).toEqual(['onboarding-pin']);
    expect(onboardingHints({...view,board:{cards:[{canPin:true,pinnedBy:[{seat:1}]}]}}).map(hint=>hint.id)).toEqual(['onboarding-station']);
    expect(onboardingHints({...view,board:{cards:[{canPin:true,pinnedBy:[{seat:2}]}]}})).toHaveLength(2);
    expect(onboardingHints({...view,reveal:{available:true}})).toEqual([]);
  });
  it('ignores malformed, disabled and non-actionable progress without reading private identifiers',()=>{
    for(const view of [null,{},[],{mode:'online'},{...active(),crew:{status:'active',mySeat:0}}])expect(onboardingHints(view)).toEqual([]);
    expect(onboardingHints({...active(),finale:{islet:{id:'other',built:false,canBuild:true}}})).toEqual([]);
    expect(onboardingHints({...active(),board:{cards:[{canPin:false}]}})).toEqual([]);
    expect(onboardingHints({...active(),account:{...active().account,connection:{state:'offline'}}})).toEqual([]);
  });
});

describe('device-only hint lifecycle',()=>{
  it('waits for active play and does not spend its delay under an overlay',()=>{
    const state=createOnboardingState();state.update(signedOut());
    state.tick(.1);expect(state.read()).toBeNull();state.tick(60,{blocked:true});
    expect(state.read()).toBeNull();for(let i=0;i<10;i++)state.tick(.1);
    expect(state.read()).toBeNull();expect(settle(state)?.id).toBe('onboarding-sign-in');
    state.tick(.1,{blocked:true});expect(state.read()).toBeNull();
    expect(settle(state)?.id).toBe('onboarding-sign-in');
  });
  it('keeps one hint stable through unchanged snapshots and resets time for a different step',()=>{
    const state=createOnboardingState();state.update(signedOut());settle(state);
    for(let i=0;i<10;i++){state.update(signedOut());expect(state.read()?.id).toBe('onboarding-sign-in');}
    state.update(signedIn(),{introComplete:true});expect(state.read()).toBeNull();expect(settle(state)?.id).toBe('onboarding-kit');
  });
  it('honors global hints preference, malformed inputs and bounded stalled-frame timing',()=>{
    const state=createOnboardingState({preferences:{hintsEnabled:false}});state.update(signedOut());
    expect(settle(state)).toBeNull();state.setPreferences(null);state.update(signedOut());
    for(const delta of [NaN,Infinity,-1,0])state.tick(delta);
    expect(state.read()).toBeNull();state.tick(60);expect(state.read()).toBeNull();
    expect(settle(state)?.id).toBe('onboarding-sign-in');
  });
  it('persists each dismissed hint once through existing preferences and a reload',()=>{
    let value=null,writes=0;const storage={getItem:()=>value,setItem:(key,next)=>{expect(key).toBe(PREFERENCES_KEY);value=next;writes++;}};
    const state=createOnboardingState({onPreferences:preferences=>savePreferences(storage,preferences)});
    state.update({...signedOut(),captain:{name:'PRIVATE'},crew:{code:'PRIVATE'}});settle(state);
    expect(state.dismiss()).toBe(true);expect(state.dismiss()).toBe(false);expect(writes).toBe(1);
    expect(JSON.stringify(state.preferences)).not.toContain('PRIVATE');expect(value).not.toContain('PRIVATE');
    expect(state.preferences.dismissedHints).toEqual(['onboarding-sign-in']);
    const restored=createOnboardingState({preferences:loadPreferences(storage)});restored.update(signedOut());
    expect(settle(restored)).toBeNull();
  });
  it('retains local dismissal if storage is denied and filters unknown or oversized preference IDs',()=>{
    const state=createOnboardingState({preferences:{dismissedHints:['bad value','x'.repeat(1000),7]},onPreferences:()=>{throw Error('Storage denied');}});
    state.update(signedOut());settle(state);expect(()=>state.dismiss()).not.toThrow();
    expect(state.preferences.dismissedHints).toEqual(['onboarding-sign-in']);expect(settle(state)).toBeNull();
  });
  it('retains a new dismissal when existing device history reaches its limit',()=>{
    const previous=Array.from({length:100},(_,i)=>`old-${i}`),state=createOnboardingState({preferences:{dismissedHints:previous}});
    state.update(signedOut());settle(state);state.dismiss();
    expect(state.preferences.dismissedHints).toHaveLength(100);
    expect(state.preferences.dismissedHints).toContain('onboarding-sign-in');
    state.update(signedOut());expect(settle(state)).toBeNull();
  });
  it('reaches all five fixed hints without creating game outcomes',()=>{
    const state=createOnboardingState(),found=[];
    const crew={...signedIn(),account:{...signedIn().account,hasKit:true},permissions:{createCrew:true},crew:{status:'none'}};
    const build={...active(),finale:{islet:{id:'islet_signal_station',built:false,canBuild:true}},board:{cards:[{canPin:true,pinnedBy:[]}]}};
    for(const view of [signedOut(),signedIn(),crew,build,build]){state.update(view,{introComplete:true});found.push(settle(state)?.id);state.dismiss();}
    expect(found).toEqual(ONBOARDING_IDS);expect(state.preferences.dismissedHints).toEqual(ONBOARDING_IDS);
    expect(build.board.cards[0].canPin).toBe(true);expect(build.finale.islet.built).toBe(false);
  });
});
