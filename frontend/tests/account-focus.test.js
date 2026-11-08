// Native keyboard focus in the account deletion disclosure; no player data is sent.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

async function mount(page){
  await page.evaluate(async()=>{
    await window.g20Import('/src/ui/kit/kit.css');
    const {createAccountScreen}=await window.g20Import('/src/screens/account/index.js');
    const {createModal}=await window.g20Import('/src/ui/kit/modal.js');
    const view={account:{state:'signed_in',captainName:'Captain Lantern',canContinue:false}};
    const sent=[],screen=createAccountScreen({send:(...args)=>sent.push(args)});
    screen.update(view);
    const modal=createModal({title:'Account and saved games',body:screen.element});
    modal.open();window.accountFocus={screen,modal,view,sent};
  });
  await page.getByRole('button',{name:'Delete my data',exact:true}).focus();
  await page.keyboard.press('Enter');
  expect(await page.getByRole('button',{name:'Confirm deletion',exact:true})
    .evaluate(el=>el===document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.getByRole('button',{name:'Keep my data',exact:true})
    .evaluate(el=>el===document.activeElement)).toBe(true);
}

it.each([320,375])('returns keyboard focus to a visible Delete my data control on a %ipx short screen',async width=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width,height:400});
    await mount(page);await page.keyboard.press('Enter');
    expect(await page.getByRole('button',{name:'Confirm deletion',exact:true}).count()).toBe(0);
    expect(await page.getByRole('button',{name:'Delete my data',exact:true})
      .evaluate(el=>el===document.activeElement)).toBe(true);
    expect(await page.getByRole('button',{name:'Delete my data',exact:true}).evaluate(el=>{
      const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight
        &&rect.left>=0&&rect.right<=innerWidth&&rect.height>=44&&rect.width>=44;
    })).toBe(true);
    expect(await page.evaluate(()=>window.accountFocus.sent)).toEqual([]);
  });
});

it('keeps the cancel button focused when account view data refreshes',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    await page.evaluate(()=>window.accountFocus.screen.update(window.accountFocus.view));
    expect(await page.getByRole('button',{name:'Keep my data',exact:true})
      .evaluate(el=>el===document.activeElement)).toBe(true);
    expect(await page.evaluate(()=>window.accountFocus.sent)).toEqual([]);
  });
});
