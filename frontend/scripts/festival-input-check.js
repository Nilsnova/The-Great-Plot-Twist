// Real world/gamepad regression under the DEV inspection hook; production hooks stay absent.
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
export async function checkFestivalInput(check){
 const previousMode=process.env.NODE_ENV;
 // A preceding production preview in this process must not disable the DEV inspection fixture.
 process.env.NODE_ENV='development';
 const env=await openWorldBrowser(),{page}=env;
 try{
  page.setDefaultTimeout(10000);
  await stubIntro(page);await page.goto(`${env.url}/?demo=1&festival=1`);await startFromTitle(page);
  await page.waitForFunction(()=>document.querySelector('.arrival')?.hidden===true);
  await page.evaluate(()=>window.__island.world.whenIdle());
  await page.evaluate(async()=>{await window.__island.demo.stop?.();window.__island.caseUi.close();});
  await page.evaluate(()=>{window.__festivalPad={id:'festival-fixture',mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__festivalPad],configurable:true});});
  await page.waitForTimeout(100);
  const calibration=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
  await page.evaluate(()=>window.__festivalPad.axes=[1,0]);await page.waitForTimeout(300);
  const moved=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
  check(Math.hypot(moved.x-calibration.x,moved.z-calibration.z)>.01,'The gamepad fixture moves the explorer before the dialog opens');
  await page.evaluate(()=>window.__festivalPad.axes=[0,0]);
  await page.getByRole('button',{name:'Festival',exact:true}).click();
  const dialog=page.locator('.festival-modal[open]');await dialog.locator('.festival-lamp').last().waitFor();
  const before=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z}));
  await page.evaluate(()=>{window.__festivalPad.axes=[1,0];window.__festivalPad.buttons[3].pressed=true;});
  await page.waitForTimeout(400);
  const after=await page.evaluate(()=>({x:window.__island.player.position.x,z:window.__island.player.position.z,chart:window.__island.chart.open}));
  check(Math.hypot(after.x-before.x,after.z-before.z)<.001,'Gamepad sticks cannot move the explorer behind the festival dialog');
  check(!after.chart,'Gamepad Y cannot open the sea chart behind the festival dialog');
  await page.evaluate(()=>{window.__festivalPad.axes=[0,0];window.__festivalPad.buttons[3].pressed=false;});
  await dialog.getByRole('button',{name:'Close dialog',exact:true}).focus();
  await page.evaluate(()=>window.__festivalPad.buttons[0].pressed=true);
  await dialog.waitFor({state:'hidden'});
  check(true,'Gamepad A activates the focused dialog control instead of a world action');
  await page.evaluate(()=>{window.__festivalPad.buttons.forEach(button=>button.pressed=false);});
  const cancellation=await page.evaluate(async()=>{
    const {createPanel}=await import('/src/screens/duels/panel.js');
    const {createViewStore}=await import('/src/screens/duels/view-store.js');
    async function run(dispose,stage){
      const store=createViewStore({mode:'ready'});let finish,selected=0,inspected=0;
      const adapter={read:store.read,subscribe:store.subscribe,setVisible(){},refresh:()=>stage==='refresh'?new Promise(resolve=>finish=resolve):Promise.resolve(),select(){selected++;return stage==='select'?new Promise(resolve=>finish=()=>resolve({get ok(){inspected++;return false;}})):Promise.resolve({ok:false});},dispose(){store.dispose();}};
      const panel=createPanel({container:document.body},adapter,()=>{}),pending=panel.open('festival-fixture');
      if(stage==='select')for(let index=0;index<8;index++)await Promise.resolve();
      if(!finish)throw new Error('The handoff fixture did not reach its pending stage.');
      if(dispose)panel.dispose();else panel.close();await new Promise(resolve=>setTimeout(resolve,0));finish();await pending;
      if(!dispose)panel.dispose();return {selected,inspected};
    }
    return {refresh:[await run(false,'refresh'),await run(true,'refresh')],select:[await run(false,'select'),await run(true,'select')]};
  });
  check(cancellation.refresh.every(value=>value.selected===0),'Closing or disposing a pending handoff prevents a late duel-detail request');
  check(cancellation.select.every(value=>value.inspected===0),'Late duel-detail answers are ignored after close or disposal');
  check(env.errors.length===0,'Festival world/input lifecycle has no browser errors');
 }finally{await env.close();if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;}
}
