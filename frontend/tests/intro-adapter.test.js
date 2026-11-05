// Adapter navigation uses the unmodified engine and keeps a replayable, atomic move log.
import { expect, it } from 'vitest';
import { story, GOOD_ENDING, TRAPPED_ROUTE } from './story-fixture.js';
import { createIntroAdapter } from '../src/story/intro-adapter.js';
it('routes shore to desk through the cottage and logs the exact engine actions', () => {
  const intro=createIntroAdapter(story);expect(intro.visit('shore').accepted).toBe(true);
  expect(intro.visit('desk').accepted).toBe(true);expect(intro.actions).toEqual(['to_shore','shore_back','to_desk']);
});
it('refused actions and unknown hotspots change no state, log or journal', () => {
  let saved=null,writes=0;const intro=createIntroAdapter(story,{read:()=>saved,write:value=>{saved=value;writes++;}});
  intro.visit('tower_door');const before=JSON.stringify({state:intro.state,actions:intro.actions,saved,writes});
  expect(intro.perform('unlock_door').accepted).toBe(false);expect(intro.visit('jail').accepted).toBe(false);
  expect(JSON.stringify({state:intro.state,actions:intro.actions,saved,writes})).toBe(before);
});
it('plays both original endings and restores only valid complete move journals', () => {
  for(const path of [GOOD_ENDING,[...TRAPPED_ROUTE,'untie']]) {
    let saved=null;const journal={read:()=>saved,write:value=>{saved=value;}};const intro=createIntroAdapter(story,journal);
    path.forEach(id=>expect(intro.perform(id).accepted,id).toBe(true));expect(intro.state.ended).toBe(true);
    const restored=createIntroAdapter(story,journal);expect(restored.actions).toEqual(path);expect(restored.state).toEqual(intro.state);
    const copy=restored.actions;copy.push('bad');expect(restored.actions).toEqual(path);
  }
  expect(createIntroAdapter(story,{read:()=>JSON.stringify({version:1,actions:['to_desk','bad']}),write(){}}).actions).toEqual([]);
});
it('does not change original story data, and returns independent view/state data', () => {
  const before=JSON.stringify(story),intro=createIntroAdapter(story);intro.visit('desk');intro.perform('take_key');
  const view=intro.view;view.choices[0].label='Changed';intro.state.inventory.push('bad');
  expect(JSON.stringify(story)).toBe(before);expect(intro.state.inventory).not.toContain('bad');
});
