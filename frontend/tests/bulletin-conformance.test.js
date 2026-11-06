// Every rehearsal variant uses the route-shaped schema; callers cannot mutate snapshots.
import {describe,it,expect} from 'vitest';
import {createFakeCaseAdapter} from '../src/adapter/fake/index.js';
import {createUnavailableCaseAdapter} from '../src/adapter/unavailable.js';
import {validateBulletin} from '../src/adapter/conformance/bulletin.js';
import {caseScreenFor} from '../src/world/places/case-spots.js';
describe('bulletin adapter integration',()=>{
  it('defaults to off for both disconnected and local clients',()=>{
    for(const create of [createUnavailableCaseAdapter,createFakeCaseAdapter]){
      const adapter=create();validateBulletin(adapter.read().bulletin);
      expect(adapter.read().bulletin.status).toBe('off');adapter.dispose();
    }
  });
  for(const scenario of ['calm','real','almanac','storm','relit','hook','stale','unavailable','off'])it(`validates ${scenario} and publishes owned snapshots`,()=>{
    const adapter=createFakeCaseAdapter();let deliveries=0;
    const off=adapter.subscribe(event=>{deliveries++;event.view.bulletin.lines.push({kind:'mutated',text:'caller'});});
    expect(adapter.dev.setBulletin(scenario)).toBe(true);const view=adapter.read();validateBulletin(view.bulletin);
    expect(view.bulletin.lines.every(line=>line.kind!=='mutated')).toBe(true);expect(deliveries).toBe(1);
    off();adapter.dispose();
  });
  it('keeps the bulletin separate from the C1 evidence search',()=>{
    expect(caseScreenFor({id:'bulletin_board'})).toEqual({screen:'bulletin'});
    expect(caseScreenFor({id:'notice_board'})).toEqual({screen:'search',spot:'notice_board'});
  });
  it('only mirrors an accepted building list into the fake finale readiness',()=>{
    const adapter=createFakeCaseAdapter();
    adapter.dev.setIsletBuilt(['plot_1','islet_signal_station']);
    expect(adapter.read().finale.lights.find(light=>light.id==='islet_signal_station').ready).toBe(true);
    adapter.dev.reset();expect(adapter.read().finale.lights.find(light=>light.id==='islet_signal_station').ready).toBe(true);
    adapter.dispose();
  });
});
