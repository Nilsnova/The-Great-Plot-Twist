// Audit the actual Exchange panel through the explicit local adapter and public native controls.
import {startFromTitle} from './shell-browser-tools.js';

const selector='.market-modal[open]';
const simulation='Simulation with play money. Real names and real prices, no real money and no prizes.';

async function openLocalMarket(page,url){
  await page.goto(url+'/?case=local&market=local');
  await startFromTitle(page);
  await page.evaluate(async()=>{
    const game=window.__island;await game.world.whenIdle();
    if(game.world.current?.id!=='saltreach_harbor'&&!await game.world.goTo('saltreach_harbor',{fast:true}))
      throw new Error('The market audit could not reach the harbor.');
    const zone=game.world.current.zones.find(item=>item.id==='market_hall');
    game.player.position.set(zone.x,game.world.current.groundHeight(zone.x,zone.z),zone.z);
    game.renderer.domElement.focus();
  });
  await page.waitForFunction(()=>document.querySelector('.interact')?.dataset.zone==='market_hall'
    &&document.activeElement?.matches('canvas[tabindex="0"]')===true);
  await page.keyboard.press('KeyE');
  await page.locator(selector).waitFor();
  await page.locator(selector+' .market-prices .market-card').first().waitFor();
}

async function notices(panel){
  return panel.evaluate((root,literal)=>{
    const notes=[...root.querySelectorAll('.market-simulation')].filter(element=>!element.closest('[hidden]'));
    const text=root.textContent;
    return {simulationNotice:notes.length===1&&notes[0].textContent===literal,
      creditsOnlyInSettings:!root.querySelector('a[href*="binance"],a[href*="finnhub"],a[href*="creativecommons"],.market-credits')
        &&!text.includes('Real prices from Binance market data.')&&!text.includes('Stock prices from Finnhub.')};
  },simulation);
}

async function shortPanel(page,capture){
  await page.setViewportSize({width:375,height:400});
  const checks=await page.locator(selector).evaluate(async root=>{
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

export async function auditMarketPanel(page,{url,audit,capture}){
  let marketRequests=0;
  const observe=request=>{if(new URL(request.url()).pathname.startsWith('/api/market'))marketRequests++;};
  page.on('request',observe);
  try{
    await openLocalMarket(page,url);
    const panel=page.locator(selector),checks={simulationNotice:true,creditsOnlyInSettings:true};
    const auditState=async name=>{
      await audit(name,selector,'case');
      const current=await notices(panel);
      checks.simulationNotice&&=current.simulationNotice;checks.creditsOnlyInSettings&&=current.creditsOnlyInSettings;
    };
    await auditState('market-prices');
    const prices=panel.getByRole('tab',{name:'Prices',exact:true}),positions=panel.getByRole('tab',{name:'Your positions',exact:true});
    await prices.focus();await page.keyboard.press('ArrowRight');
    checks.nativeTabsArrows=await positions.evaluate(element=>element.getAttribute('aria-selected')==='true'&&document.activeElement===element);
    await page.keyboard.press('ArrowLeft');checks.nativeTabsArrows&&=await prices.evaluate(element=>element.getAttribute('aria-selected')==='true'&&document.activeElement===element);
    const company=panel.locator('.market-card').filter({has:page.getByRole('heading',{name:/^Tidewright Works\b/})});
    await company.getByRole('button',{name:'Open a position in Tidewright Works',exact:true}).click();
    const form=company.locator('.market-form:not([hidden])');await form.waitFor();
    await auditState('market-open-form');
    const rising=form.getByRole('radio',{name:'Rising: you gain when the price goes up',exact:true});
    const falling=form.getByRole('radio',{name:'Falling: you gain when the price goes down',exact:true});
    await rising.check();await rising.focus();await page.keyboard.press('ArrowRight');checks.nativeSideArrows=await falling.isChecked();
    await page.keyboard.press('ArrowLeft');checks.nativeSideArrows&&=await rising.isChecked();
    const stakes=form.locator('input[type="radio"][name$="-stake"]');
    await stakes.first().check();await stakes.first().focus();await page.keyboard.press('ArrowRight');checks.nativeStakeArrows=await stakes.nth(1).isChecked();
    await page.keyboard.press('ArrowLeft');checks.nativeStakeArrows&&=await stakes.first().isChecked();
    const confirm=form.getByRole('button',{name:/^Open rising position for /});await confirm.waitFor();
    await auditState('market-open-confirmation');
    await confirm.click();
    await page.waitForFunction(()=>document.querySelector('.market-modal[open] .market-status')?.textContent
      .startsWith('Opened your rising position in Tidewright Works at '));
    await positions.click();
    const position=panel.locator('.market-position').filter({has:page.getByRole('heading',{name:/^Tidewright Works\b/})});
    await position.waitFor();
    await auditState('market-positions');
    await position.getByRole('button',{name:'Close your rising position in Tidewright Works',exact:true}).click();
    await position.getByRole('button',{name:'Yes, close it',exact:true}).waitFor();
    await auditState('market-close-confirmation');
    Object.assign(checks,await shortPanel(page,capture));
    await page.keyboard.press('Escape');
    checks.escapeClosed=await page.locator(selector).count()===0;
    checks.noPause=await page.locator('.shell-screen[open]').count()===0;
    checks.canvasFocus=await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')===true);
    checks.noLiveMarketRequests=marketRequests===0;
    return {width:375,height:400,checks};
  }finally{page.off('request',observe);await page.setViewportSize({width:1280,height:900});}
}
