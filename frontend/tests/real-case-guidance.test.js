// Supplied case capabilities drive live guidance; no story solution or real service is used.
import {describe, expect, it} from 'vitest';
import {composeRealView} from '../src/online/case-adapter/view.js';
import {createCaseFixture} from '../scripts/online-case-fixture.js';

function state(options = {}) {
  const snapshot = createCaseFixture(options);
  return {accountState:'signed_in',me:{coins:0,kit:'stranger'},config:{flags:{case:true}},
    crew:{...snapshot.crew,seats:snapshot.seats},case:snapshot,caseLoaded:true};
}
const actionIds = view => view.hints.actions.map(action => action.id);
const hints = value => composeRealView(value).hints;

describe('live capability-derived next steps', () => {
  it('offers earned pins and a real search destination before any spot is opened', () => {
    const value = state(), view = composeRealView(value);
    expect(view.search.routes).toEqual([]);
    expect(actionIds(view)).toEqual(['next-pin-card','next-search-route','next-order-partner']);
    expect(view.hints.actions[1]).toMatchObject({screen:'search',params:{spot:'saltreach_harbor.ferry_pier'},available:true});
    expect(view.hints.items.map(item => item.title)).toEqual(['1. Share a clue','2. Follow a lead','3. Ask a partner']);
  });

  it('moves from pinning to comparing without naming an answer or card combination', () => {
    const value = state();
    value.case.board.cards.forEach(card => {card.canPin=false;card.state='pinned';});
    const view = composeRealView(value);
    expect(actionIds(view)).toContain('next-compare-cards');
    expect(actionIds(view)).not.toContain('next-pin-card');
    expect(hints(value).items.find(item => item.id==='next-compare-cards').body).toContain('two cards');
    value.case.board.canPair=false;
    expect(actionIds(composeRealView(value))).not.toContain('next-compare-cards');
  });

  it('never offers a pair from a single selectable card', () => {
    const value = state();value.case.board.cards=value.case.board.cards.slice(0,1);
    value.case.board.cards[0].canPin=false;
    expect(actionIds(composeRealView(value))).not.toContain('next-compare-cards');
  });

  it('links blocked searches as details and preserves their supplied explanation', () => {
    const value = state();value.case.board.cards=[];value.case.partners=[];
    const route = value.case.search.spots[0].routes[0];
    route.canStart=false;route.reason='locked_window';route.statusText='Recorded route opens later.';
    const result = hints(value);
    expect(result.actions).toEqual([expect.objectContaining({id:'next-search-details',screen:'search',params:{spot:'saltreach_harbor.ferry_pier'}})]);
    expect(result.items[0]).toMatchObject({title:'1. Check a lead',body:'Recorded route opens later.'});
    expect(JSON.stringify(result)).not.toContain('Start search');
  });

  it('keeps a running search distinct from an earned result, even at display zero', () => {
    const value = state({progress:{search:'working'}});value.case.board.cards=[];value.case.partners=[];
    value.caseElapsed=1000;
    const result = hints(value);
    expect(result.actions[0].id).toBe('next-search-progress');
    expect(result.items[0].body).toContain('underway');
    expect(JSON.stringify(result)).not.toContain('Supplied completed');
  });

  it('prioritizes server-authorized nightfall, post and aiming transitions', () => {
    const ready = state({progress:{night:'ready'}});
    expect(hints(ready).actions[0]).toMatchObject({id:'next-call-night',screen:'finale'});
    const night = state({progress:{night:'night'}});
    expect(hints(night).actions[0].id).toBe('next-take-post');
    const aiming = state({progress:{night:'night',post:true}});
    expect(hints(aiming).actions[0].id).toBe('next-aim-light');
    aiming.case.finale.lights.forEach(light => {light.canAim=false;light.canTake=false;});
    expect(hints(aiming).items[0].body).toBe('Supplied night status.');
    expect(hints(aiming).actions[0].id).toBe('next-night-status');
  });

  it('offers only earned accusation/reveal and does not treat the public relighting as a solve', () => {
    const value = state({progress:{night:'success'}});
    expect(hints(value).actions[0]).toMatchObject({id:'next-review-evidence',screen:'accusation'});
    expect(JSON.stringify(hints(value))).not.toContain('recorded_suspect');
    value.case.accusation.allowed=false;value.casePresentation={aboard:true};
    expect(hints(value).items[0].body).toBe('Supplied accusation status.');
    const solved = state({progress:{reveal:true}});
    expect(hints(solved).actions[0]).toMatchObject({id:'next-read-reveal',screen:'reveal'});
    solved.casePresentation={revealIndex:2};
    expect(hints(solved).actions[0]).toMatchObject({id:'next-visit-coast',label:'See the coast',screen:'relighting'});
    solved.worldSnapshot={stage:'relit',lightsOn:true};
    expect(hints(solved).actions[0].label).toBe('See the relit coast');
    value.worldSnapshot={stage:'relit',lightsOn:true};
    expect(actionIds(composeRealView(value))).not.toContain('next-read-reveal');
  });

  it('uses the live station permission without guessing from the wallet', async () => {
    const {projectCaseGuidance} = await import('../src/online/case-adapter/guidance.js');
    const view = composeRealView(state());
    view.finale.islet={id:'islet_signal_station',built:false,canBuild:true};
    expect(projectCaseGuidance(view).actions[0]).toMatchObject({id:'next-build-station',screen:'finale'});
    view.finale.islet.canBuild=false;view.captain.coins=999999;
    expect(projectCaseGuidance(view).actions.some(action => action.id==='next-build-station')).toBe(false);
  });

  it('offers crew setup only when the normalized permission allows it', () => {
    const value = state();value.crew=null;value.case=null;value.caseLoaded=false;
    expect(hints(value).actions[0]).toMatchObject({id:'next-find-crew',screen:'crew'});
    value.me.kit=null;
    expect(hints(value)).toEqual({items:[],actions:[]});
    const forming = state();forming.crew.status='forming';forming.crew.startedAt=null;
    forming.case=null;forming.caseLoaded=false;
    expect(hints(forming).actions[0]).toMatchObject({id:'next-muster-crew',screen:'crew'});
    forming.crew.seats=[];
    expect(hints(forming)).toEqual({items:[],actions:[]});
  });

  it.each(['signed_out','expired','error','signing_in'])('clears private guidance after account becomes %s', accountState => {
    expect(hints({...state(),accountState})).toEqual({items:[],actions:[]});
  });

  it.each(['offline','error','expired','rate_limited'])('keeps unknown connection %s from advertising actions', connectionState => {
    expect(hints({...state(),connection:{state:connectionState}})).toEqual({items:[],actions:[]});
  });

  it.each(['loading','slow'])('keeps known guidance stable during a %s background refresh', connectionState => {
    const value = state();
    expect(hints({...value,connection:{state:connectionState}})).toEqual(hints(value));
    expect(hints({...value,caseLoaded:false,connection:{state:connectionState}})).toEqual({items:[],actions:[]});
  });

  it('never navigates to a hotspot absent from the presented search list', async () => {
    const {projectCaseGuidance} = await import('../src/online/case-adapter/guidance.js');
    const view = composeRealView(state());
    const result = projectCaseGuidance(view,{spots:[{hotspot:'private-hidden-extra',routes:[{canStart:true}]}]});
    expect(result.actions.some(action => action.screen==='search')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private-hidden-extra');
  });

  it('does not recommend busy partners or an order without a supplied target', () => {
    const value = state();
    value.case.partners.forEach(partner => {partner.canOrder=false;});
    expect(actionIds(composeRealView(value))).not.toContain('next-order-partner');
    value.case.partners.forEach(partner => {partner.canOrder=true;partner.targets={fetch:[],man_light:[]};});
    expect(actionIds(composeRealView(value))).not.toContain('next-order-partner');
  });

  it('stays empty with disabled, missing or unread case data', () => {
    const value = state();
    for(const fields of [{config:null},{config:{flags:{case:false}}},{case:null},{caseLoaded:false}]) {
      expect(hints({...value,...fields})).toEqual({items:[],actions:[]});
    }
  });

  it('returns at most three detached steps with safe destinations and no private data or rule imports', () => {
    const value = state(), original = structuredClone(value);
    value.case.privateExtra='private-hidden-extra';value.case.search.spots[0].routes[0].privateExtra='private-route-extra';
    const result = hints(value), serialized=JSON.stringify(result);
    expect(result.actions.length).toBeLessThanOrEqual(3);
    for(const marker of ['private-hidden-extra','private-route-extra',value.crew.id,'recorded_suspect','Supplied earned text','D1','C1'])expect(serialized).not.toContain(marker);
    expect(result.actions.every(action => ['crew','board','search','partners','finale','accusation','reveal','relighting'].includes(action.screen))).toBe(true);
    result.items[0].body='Changed';result.actions[1].params.spot='Changed';
    expect(hints(value).actions[1].params.spot).toBe('saltreach_harbor.ferry_pier');
    expect(value.case.board).toEqual(original.case.board);
  });
});
