// Public bulletin projection keeps the existing schema and server fields without deciding outcomes.
import {describe,it,expect} from 'vitest';
import {composeRealView} from '../src/online/case-adapter/view.js';
import {caseViewKeys} from '../src/adapter/contract.js';
import {onlineBulletinView} from '../src/online/case-adapter/bulletin-view.js';
import {recordedBulletin} from './fixtures/server/bulletin.js';
const state = (bulletin,flag=true,accountState='signed_out') => ({config:{flags:{bulletin:flag}},bulletin,accountState});
describe('public bulletin schema1 projection',()=>{
  it.each(['signed_out','expired','signed_in'])('keeps a supplied bulletin public for %s',accountState=>{
    const supplied=onlineBulletinView(recordedBulletin({hook:true}));
    const view=composeRealView(state(supplied,true,accountState));
    expect(view.schema).toBe(1);expect(Object.keys(view).sort()).toEqual([...caseViewKeys].sort());
    expect(view.bulletin).toEqual(supplied);
    expect(view.log.observations).toEqual([{id:'recorded_hook',text:'A light flashing far out at sea'}]);
    expect(view.world.lightsOn).toBe(false);expect(view.effects).toEqual([]);
  });
  it.each([undefined,false,'true',1])('masks retained public data until exact flag true: %s',flag=>{
    const input=state(onlineBulletinView(recordedBulletin({hook:true})),flag);
    if(flag===undefined)delete input.config.flags.bulletin;
    const view=composeRealView(input);
    expect(view.bulletin.status).toBe('off');expect(view.bulletin.chapterTwoHook).toBeNull();
    expect(view.log.observations).toEqual([]);
  });
  it('clones nested route fields and derives observations only from the supplied current hook',()=>{
    const supplied=onlineBulletinView(recordedBulletin({hook:true}));
    const input=state(supplied);input.bulletinObservations=[{id:'invented',text:'invented'}];
    const first=composeRealView(input);first.bulletin.lines[0].text='changed';
    first.bulletin.chapterTwoHook.beam.pattern.push('long');first.log.observations[0].text='changed';
    const next=composeRealView(input);expect(next.bulletin).toEqual(supplied);
    expect(next.log.observations[0].id).toBe('recorded_hook');
    expect(next.log.observations[0].text).toBe('A light flashing far out at sea');
  });
  it('preserves server fields and stale display copy without inferring a new hook',()=>{
    const data=recordedBulletin();const bulletin=onlineBulletinView(data,{stale:true,message:'Last posted bulletin.'});
    const view=composeRealView(state(bulletin));expect(view.bulletin).toEqual(bulletin);
    expect(view.log.observations).toEqual([]);expect(view.bulletin.weather.attribution).toBeNull();
    expect(view.bulletin.exchange).toBeNull();
  });
});
