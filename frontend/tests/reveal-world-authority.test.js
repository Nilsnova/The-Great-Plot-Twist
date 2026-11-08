// Native display boundary: a server-earned solve never grants a different public world outcome.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const native=browserHarness();

it.each([
  {lightsOn:false,receipt:'locked',expected:'Your case is complete.'},
  {lightsOn:false,receipt:'unchanged',expected:'Your case is complete.'},
  {lightsOn:true,receipt:'locked',expected:'The coast is relit.'},
  {lightsOn:true,receipt:'unchanged',expected:'The coast is relit.'},
])('finishing the reveal follows public lightsOn=$lightsOn, not the private $receipt receipt',async scenario=>{
  await native.withPage(async page=>{
    await page.setViewportSize({width:320,height:568});
    await page.evaluate(async scenario=>{
      await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
      await window.g20Import('/src/screens/screens.css');
      const {createRevealScreen}=await window.g20Import('/src/screens/reveal.js');
      const view={world:{stage:scenario.lightsOn?'relit':'dark',lightsOn:scenario.lightsOn},
        reveal:{available:true,world:scenario.receipt,done:false,index:0,total:1,canAdvance:true,
          line:{id:'recorded_line',title:'Recorded line',text:'Supplied recorded line.',cites:[]},cards:[]}};
      const intents=[],navigation=[];
      const screen=createRevealScreen({send(name){intents.push(name);view.reveal={...view.reveal,done:true,index:1,canAdvance:false};screen.update(view);return Promise.resolve({accepted:true});},navigate:name=>navigation.push(name)});
      document.body.append(screen.element);screen.update(view);
      window.revealAuthorityProof={view,screen,intents,navigation};
    },scenario);
    try{
      await page.getByRole('button',{name:'Finish the reveal',exact:true}).click();
      expect(await page.locator('.case-reveal > p').textContent()).toBe(scenario.expected);
      expect(await page.evaluate(()=>window.revealAuthorityProof.intents)).toEqual(['nextReveal']);
      await page.getByRole('button',{name:'See the coast',exact:true}).click();
      expect(await page.evaluate(()=>window.revealAuthorityProof.navigation)).toEqual(['relighting']);
      expect(await page.evaluate(()=>window.revealAuthorityProof.view.world.lightsOn)).toBe(scenario.lightsOn);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }finally{await page.evaluate(()=>{window.revealAuthorityProof.screen.dispose();delete window.revealAuthorityProof;});}
  });
});
