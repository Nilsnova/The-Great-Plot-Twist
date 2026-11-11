// Audit the Harbor market stall (lane H, "Up or down in 1 hour?") that the market hall hotspot opens, with
// public native controls. The hotspot opens the card in the local game (?market=local: the in-memory
// calls fake, with prices and calls); the same card is then audited with the made-up calls fixture of the
// Harbor card tests: up or down, a 5 / 10 / 25 stake, the confirm button and the placed call with its
// countdown. No /api/market* request.
import {startFromTitle} from './shell-browser-tools.js';

const selector='.harbor-market[open]';
const playMoney='Play coins only. They cannot be bought or cashed out.';

async function openFromHotspot(page,url){
  await page.goto(url+'/?adapter=local&market=local');
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
  await page.locator(selector+' .harbor-footnote').waitFor();
  await page.locator(selector+' .harbor-asset .harbor-picker').first().waitFor();
}

// The same card with made-up prices, opened over the game the way the hotspot opens it.
async function openWithPrices(page){
  await page.evaluate(async()=>{
    const fx=await import('/tests/harbor/fixtures.js');
    const {createMarketEntry}=await import('/src/harbor/market-card.js');
    const canvas=document.querySelector('canvas[tabindex="0"]');
    window.__auditMarket=createMarketEntry({container:document.querySelector('#game'),adapter:fx.fakeCalls({stocks:'open'}),
      now:()=>fx.NOW,resetInput:()=>window.__island.resetInput?.(),focusGame:()=>canvas?.focus({preventScroll:true})});
    await window.__auditMarket.open();
  });
  await page.locator(selector+' .harbor-asset').first().waitFor();
}

async function notices(panel){
  return panel.evaluate((root,literal)=>{
    const notes=[...root.querySelectorAll('.harbor-footnote')].filter(element=>!element.closest('[hidden]'));
    const text=root.textContent;
    return {simulationNotice:notes.length===1&&notes[0].textContent===literal,
      creditsOnlyInSettings:!root.querySelector('a[href*="binance"],a[href*="finnhub"],a[href*="creativecommons"]')
        &&!text.includes('Real prices from Binance market data.')&&!text.includes('Stock prices from Finnhub.')};
  },playMoney);
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

async function closesToGame(page){
  await page.keyboard.press('Escape');
  await page.locator(selector).waitFor({state:'hidden'});
  return {escapeClosed:await page.locator(selector).count()===0,
    noPause:await page.locator('.shell-screen[open]').count()===0,
    canvasFocus:await page.evaluate(()=>document.activeElement?.matches('canvas[tabindex="0"]')===true)};
}

export async function auditMarketPanel(page,{url,audit,capture}){
  let marketRequests=0;
  const observe=request=>{if(new URL(request.url()).pathname.startsWith('/api/market'))marketRequests++;};
  page.on('request',observe);
  try{
    await openFromHotspot(page,url);
    const panel=page.locator(selector),checks={simulationNotice:true,creditsOnlyInSettings:true};
    const auditState=async name=>{
      await audit(name,selector,'case');
      const current=await notices(panel);
      checks.simulationNotice&&=current.simulationNotice;checks.creditsOnlyInSettings&&=current.creditsOnlyInSettings;
    };
    checks.hotspotPrices=await panel.locator('.harbor-asset').count()===5
      &&/^\$[\d,.]+$/.test(await panel.locator('.harbor-asset .harbor-price').first().textContent())
      &&await panel.locator('.harbor-question').first().textContent()==='Up or down in 1 hour?';
    await auditState('market-hotspot');
    const hotspot=await closesToGame(page);
    checks.hotspotEscapeClosed=hotspot.escapeClosed;checks.hotspotNoPause=hotspot.noPause;checks.hotspotCanvasFocus=hotspot.canvasFocus;
    await openWithPrices(page);
    await auditState('market-prices');
    const asset=panel.locator('.harbor-asset').filter({has:page.getByRole('heading',{name:'Ether',exact:true})});
    const sides=asset.getByRole('group',{name:'Up or down for Ether',exact:true});
    const stakes=asset.getByRole('group',{name:'Your stake',exact:true});
    checks.nothingPreselected=await asset.locator('[aria-pressed="true"]').count()===0
      &&await asset.locator('.harbor-confirm').isDisabled();
    const up=sides.getByRole('button',{name:'Up, Ether',exact:true}),ten=stakes.getByRole('button',{name:'10 coins on Ether',exact:true});
    await up.click();await ten.click();
    const confirm=asset.getByRole('button',{name:'Place 🪙 10 on Up, Ether',exact:true});await confirm.waitFor();
    checks.choicesPressed=await up.getAttribute('aria-pressed')==='true'&&await ten.getAttribute('aria-pressed')==='true';
    await auditState('market-confirm');
    // Keyboard only: the confirm button takes Enter.
    await confirm.focus();await page.keyboard.press('Enter');
    await asset.locator('.harbor-notice').filter({hasText:'Your 🪙 10 is on Up.'}).waitFor();
    checks.placedCountdown=await asset.locator('.harbor-call[data-open="true"] .harbor-now').textContent()==='Decided in 60 min';
    await auditState('market-placed');
    Object.assign(checks,await shortPanel(page,capture));
    await page.setViewportSize({width:1280,height:900});
    Object.assign(checks,await closesToGame(page));
    await page.evaluate(()=>{window.__auditMarket?.dispose();delete window.__auditMarket;});
    checks.noLiveMarketRequests=marketRequests===0;
    return {width:375,height:400,checks};
  }finally{page.off('request',observe);await page.setViewportSize({width:1280,height:900});}
}
