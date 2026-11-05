// Only the fake decides rehearsal profiles, joins and kit coverage; views receive copies.
import {describe,it,expect} from 'vitest';
import {createFakeCaseAdapter} from '../src/adapter/fake/index.js';
import {createUnavailableCaseAdapter} from '../src/adapter/unavailable.js';
const receipt=(actions=[],ending='ending_trapped')=>({actions,ending});
describe('arrival and crew adapter',()=>{
  it.each([['true_keeper',receipt(['read_log'],'ending_rescue'),1000,'lighthouse_isle'],['witness',receipt(['warn_harbor']),1000,'saltreach_harbor'],['informant',receipt(['trust_fisherman']),1000,'saltreach_harbor'],['stranger',receipt(),1600,'saltreach_harbor']])('projects the %s fake entry profile',async(id,input,coins,place)=>{
    const adapter=createFakeCaseAdapter();await adapter.completeIntro(input);const view=adapter.read();expect(view.arrival.kit.id).toBe(id);expect(view.arrival.coins).toBe(coins);expect(view.arrival.kit.startPlace).toBe(place);expect(view.arrival.items).toContain('Brass key');
    await adapter.completeIntro(receipt());expect(adapter.read().arrival.coins).toBe(coins);
  });
  it('fills missing kits in stable seat order and returns immutable copies',async()=>{
    const a=createFakeCaseAdapter();await a.completeIntro(receipt([],'ending_rescue'));await a.createCrew();expect(a.read().crew.seats.map(s=>s.kind)).toEqual(['player','open','open','open']);await a.muster();
    expect(a.read().crew.seats.map(s=>s.kitId)).toEqual(['true_keeper','informant','stranger','witness']);const view=a.read();view.crew.seats[0].name='tampered';expect(a.read().captain.name).toBe('Captain Lantern');expect(a.read().crew.seats[0].name).toBe('Captain Lantern');
  });
  it('refuses wrong/limited joins and confirms a supplied seat preview',async()=>{
    const a=createFakeCaseAdapter();await a.completeIntro(receipt());for(let i=0;i<2;i++)expect((await a.joinCrew('bad')).reason).toBe('wrong_code');expect((await a.joinCrew('bad')).reason).toBe('too_many_tries');expect(a.read().crew.code).toBe(null);
    a.dev.advance(60);expect((await a.joinCrew('LANTERN')).accepted).toBe(true);expect(a.read().crew.joinPreview.seat).toBe(2);await a.joinCrew('LANTERN',{confirm:true});expect(a.read().crew.seats.find(s=>s.isYou).seat).toBe(2);
  });
  it('keeps the disconnected adapter from granting a kit or a cloud save',async()=>{
    const a=createUnavailableCaseAdapter();expect((await a.completeIntro(receipt([],'ending_rescue'))).accepted).toBe(false);expect(a.read().arrival.status).toBe('pending');expect(a.read().captain.save.label).toBe('Local intro only');
  });
});
it('expires join throttling before a crew exists without advancing its case clock',async()=>{const a=createFakeCaseAdapter();await a.completeIntro({ending:'ending_rescue',actions:[]});for(let i=0;i<3;i++)await a.joinCrew('WRONG');expect((await a.joinCrew('LANTERN')).reason).toBe('too_many_tries');for(let i=0;i<610;i++)a.tick(.1);expect(a.read().now).toBe(0);expect((await a.joinCrew('LANTERN')).accepted).toBe(true);});
