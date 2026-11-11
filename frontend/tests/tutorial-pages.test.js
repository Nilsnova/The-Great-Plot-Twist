// How to play (docs/TOWER-DEFENSE.md §13): the page data and the paging rules, without a DOM.
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TUTORIAL_PAGES,TUTORIAL_KEY,FIRST_RUN_PAGES,TUTORIAL_TITLE,firstRunPages,clampPage,pageView,wantsFirstRun} from '../src/tutorial/pages.js';

const sentences=text=>text.join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
const png=file=>{const data=readFileSync(fileURLToPath(new URL(`../public/pixel/${file}`,import.meta.url)));return {w:data.readUInt32BE(16),h:data.readUInt32BE(20)};};

describe('How to play pages',()=>{
  it('has 8 to 10 pages with one idea each: a unique id and title, 1 to 3 short sentences',()=>{
    expect(TUTORIAL_PAGES.length).toBeGreaterThanOrEqual(8);expect(TUTORIAL_PAGES.length).toBeLessThanOrEqual(10);
    expect(new Set(TUTORIAL_PAGES.map(page=>page.id)).size).toBe(TUTORIAL_PAGES.length);
    expect(new Set(TUTORIAL_PAGES.map(page=>page.title)).size).toBe(TUTORIAL_PAGES.length);
    for(const page of TUTORIAL_PAGES){
      const said=sentences(page.text);
      expect(said.length,page.id).toBeGreaterThanOrEqual(1);expect(said.length,page.id).toBeLessThanOrEqual(3);
      for(const sentence of said)expect(sentence.length,sentence).toBeLessThanOrEqual(110);
      expect(page.title.length).toBeLessThanOrEqual(30);expect(page.alt.length).toBeGreaterThan(5);
    }
  });
  it('covers the game in the agreed order and keeps every word in one frozen module',()=>{
    expect(TUTORIAL_PAGES.map(page=>page.id)).toEqual(['island','build','bell','captain','ashore','crew','unlocks','friend','places','controls']);
    expect(Object.isFrozen(TUTORIAL_PAGES)).toBe(true);expect(TUTORIAL_PAGES.every(page=>Object.isFrozen(page)&&Object.isFrozen(page.text))).toBe(true);
    const all=TUTORIAL_PAGES.map(page=>[page.title,...page.text,...(page.keys??[]).flat()].join(' ')).join(' ');
    for(const fact of ['16 build spots','press E','level 3','Every 5th wave','Next wave','Press F','hold F','musket button','on foot','Marksman, Brawler or Shipwright',
      'Menu › Captain','Create a game','Up to 10','after 5 minutes','three lamps','flagship','joystick','Sea chart','Zoom'])expect(all).toContain(fact);
    expect(TUTORIAL_TITLE).toBe('How to play');expect(TUTORIAL_KEY).toBe('plot_twist_tutorial_v1');
  });
  it('lists the controls as keys on the last page',()=>{
    const controls=TUTORIAL_PAGES.at(-1);
    expect(controls.keys.map(([key])=>key)).toEqual(['WASD or arrows','E','F','M','Mouse wheel']);
  });
  it('reuses existing sprites at their real size and whole-number scales that fit a 320 px card',()=>{
    for(const page of TUTORIAL_PAGES){
      expect(page.art.length,page.id).toBeGreaterThanOrEqual(1);
      let width=0;
      for(const sprite of page.art){
        expect(png(sprite.file),sprite.file).toEqual({w:sprite.w,h:sprite.h});
        expect(Number.isInteger(sprite.scale)&&sprite.scale>=1).toBe(true);
        expect(sprite.h*sprite.scale,sprite.file).toBeLessThanOrEqual(128);
        width+=sprite.w*sprite.scale;
      }
      // Phones draw the art at 75 %: it must fit the 320 px card's inner width with the gaps.
      expect(width*.75+12*(page.art.length-1),page.id).toBeLessThanOrEqual(250);
    }
  });
  it('shows the first four pages after the intro: island, build, bell, captain',()=>{
    expect(FIRST_RUN_PAGES).toBe(4);
    expect(firstRunPages().map(page=>page.id)).toEqual(['island','build','bell','captain']);
  });
  it('pages within bounds and names the buttons for each mode',()=>{
    expect(clampPage(-3,10)).toBe(0);expect(clampPage(42,10)).toBe(9);expect(clampPage(4,10)).toBe(4);
    expect(clampPage(Number.NaN,10)).toBe(0);expect(clampPage(2,0)).toBe(0);expect(clampPage('2',10)).toBe(0);
    const pages=TUTORIAL_PAGES;
    expect(pageView(pages,0)).toMatchObject({index:0,count:10,first:true,last:false,next:'Next',leave:'Close',status:'Page 1 of 10'});
    expect(pageView(pages,9)).toMatchObject({index:9,first:false,last:true,next:'Done',leave:'Close',status:'Page 10 of 10'});
    expect(pageView(pages,99).page.id).toBe('controls');
    const first=firstRunPages();
    expect(pageView(first,0,'first')).toMatchObject({next:'Next',leave:'Skip',status:'Page 1 of 4'});
    expect(pageView(first,3,'first')).toMatchObject({last:true,next:'Start playing',leave:'Skip'});
  });
  it('shows the first-run pages once per device and never to a class-code player',()=>{
    expect(wantsFirstRun()).toBe(true);
    expect(wantsFirstRun({seen:true})).toBe(false);
    expect(wantsFirstRun({classHarbor:true})).toBe(false);
  });
});
