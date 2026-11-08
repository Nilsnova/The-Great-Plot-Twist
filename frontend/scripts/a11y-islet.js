// The actual local L2 panel is audited through the same keyboard path as the game.
import {startFromTitle} from './shell-browser-tools.js';

async function openLocalPanel(page,url){
  await page.goto(url+'/?case=local&islet=local');
  await startFromTitle(page);
  await page.evaluate(async()=>{
    const game=window.__island;
    await game.world.goTo('home_islet',{fast:true});
    const zone=game.world.current.zones.find(item=>item.id==='plot_2');
    game.player.position.set(zone.x,game.world.current.groundHeight(zone.x,zone.z),zone.z);
    game.renderer.domElement.focus();
  });
  await page.waitForFunction(()=>document.querySelector('.interact')?.dataset.zone==='plot_2');
  await page.keyboard.press('KeyE');
  await page.locator('.islet-modal[open]').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.islet-modal[open] .islet-spot').length===5);
}

async function shortPanel(page,capture){
  await page.setViewportSize({width:375,height:400});
  const checks=await page.locator('.islet-modal[open]').evaluate(async root=>{
    const h=await import('/scripts/a11y-helpers.js');
    const controls=[...root.querySelectorAll('button:not(:disabled),a[href],input,select,summary')]
      .filter(control=>h.renderedForAudit(control));
    return {fitsViewport:h.withinViewport(root.getBoundingClientRect(),{width:innerWidth,height:innerHeight}),
      noPanelOverflow:!h.hasHorizontalOverflow(root),noDocumentOverflow:!h.hasHorizontalOverflow(document.documentElement),
      targets44:controls.every(control=>h.touchTargetMeetsMinimum(control.getBoundingClientRect()))};
  });
  await page.screenshot({path:capture});
  return checks;
}

export async function auditIsletPanel(page,{url,audit,capture}){
  await openLocalPanel(page,url);
  await audit('islet-panel','.islet-modal[open]','case');
  await page.locator('.islet-spot[data-plot="islet_signal_station"] button').click();
  await page.waitForFunction(()=>document.querySelector('.islet-status')?.textContent.startsWith('Signal station built.'));
  await audit('islet-built','.islet-modal[open]','case');
  const checks=await shortPanel(page,capture);
  await page.keyboard.press('Escape');
  checks.escapeClosed=await page.locator('.islet-modal[open]').count()===0;
  checks.noPause=await page.locator('.shell-screen[open]').count()===0;
  checks.canvasFocus=await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')===true);
  await page.setViewportSize({width:1280,height:900});
  return {width:375,height:400,checks};
}
