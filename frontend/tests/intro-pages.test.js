// Presentation paging must never change an engine choice or discard an earned clue.
import {describe,it,expect} from 'vitest';
import {introPages,sceneCopy,choiceCopy,passageCopy} from '../src/story/intro-pages.js';
import {createIntroAdapter} from '../src/story/intro-adapter.js';
import {story,GOOD_ENDING,TRAPPED_ROUTE} from './story-fixture.js';

describe('short intro passages',()=>{
  it('splits a long paragraph into bounded whole-word pages without losing its content',()=>{
    const text='A lantern is waiting near the shore. '.repeat(16).trim(),pages=introPages(text);
    expect(pages.length).toBeGreaterThan(1);expect(pages.every(page=>page.length<=120)).toBe(true);
    expect(pages.join(' ')).toBe(text);
  });
  it('keeps paragraph breaks as separate pages and handles empty text',()=>{
    expect(introPages('First clue.\n\nSecond clue.')).toEqual(['First clue.','Second clue.']);
    expect(introPages('')).toEqual(['Look around and choose your next move.']);
    expect(introPages('z'.repeat(251))).toEqual(['z'.repeat(120),'z'.repeat(120),'z'.repeat(11)]);
    expect(introPages('🕯'.repeat(125)).join('')).toBe('🕯'.repeat(125));
  });
  it('uses a shorter opening while keeping original copy untouched and unknown scenes intact',()=>{
    const original=JSON.stringify(story),view=createIntroAdapter(story).view;
    expect(sceneCopy(view).length).toBeLessThan(view.text.length);
    expect(sceneCopy(view)).toContain('three nights');
    expect(sceneCopy({scene:'custom',text:'An original detail.'})).toBe('An original detail.');
    expect(JSON.stringify(story)).toBe(original);
  });
  it('keeps exact IDs and blocked choices while shortening labels only',()=>{
    for(const scene of Object.values(story.scenes))for(const action of scene.actions??[]){
      const choice={id:action.id,label:action.label,disabled:true,hint:'Still locked.'},copy=choiceCopy(choice);
      expect(copy).toMatchObject({id:action.id,disabled:true,hint:'Still locked.'});
      expect(copy.label.length).toBeLessThanOrEqual(action.label.length);
      expect(choice.label).toBe(action.label);
    }
  });
  it('replaces older notices and includes newly earned notes instead of repeating the whole scene',()=>{
    const previous={scene:'desk',text:'An old overview.',notes:['An old clue.']};
    const next={scene:'desk',text:'An old overview.',notes:['An old clue.','A new clue.']};
    expect(passageCopy(next,previous,'You found a key.')).toEqual(['You found a key.','A new clue.']);
    expect(passageCopy(next,previous,'Try the locked door.').join(' ')).not.toContain('You found a key.');
  });
  it('retains full original ending prose and conditional notes for either replayable ending',()=>{
    for(const actions of [GOOD_ENDING,[...TRAPPED_ROUTE,'untie']]){
      const intro=createIntroAdapter(story);actions.forEach(id=>intro.perform(id));const view=intro.view;
      const pages=passageCopy(view,null);
      expect(pages.join(' ')).toBe([view.text,...view.notes].join(' ').replace(/\s+/g,' ').trim());
      expect(view.ended).toBe(true);expect(intro.actions).toEqual(actions);
    }
  });
});
