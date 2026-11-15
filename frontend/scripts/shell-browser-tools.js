// True once the player stands in the harbor with no dialog open. A dev build names the place through
// window.__island; a production build has no such object (check-loading.js asserts that), so there the
// focused world canvas is the sign that the harbor is ready.
// It also returns true while a first-Play cutscene, How to play page or goal card is open.
function inHarbor(orFirstCard = false) {
  if (orFirstCard && document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open]')) return true;
  if (document.querySelector('dialog[open]')) return false;
  if (window.__island) return window.__island.world.current?.id === 'saltreach_harbor';
  return !!document.activeElement?.matches('canvas[tabindex="0"]');
}
// Starts through the actual title menu: Play, the lore cutscene (skipped), the first How to play pages
// (skipped), the goal card and Saltreach
// Harbor. Shared graphics checks then exercise the world. The Lighthouse prologue left on 10 Nov (D031).
export async function startFromTitle(page) {
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  const skip=page.getByRole('button',{name:'Skip',exact:true}),card=page.locator('.goal-card[open]');
  // The lore, the first How to play pages and the card show once per device; a later Play goes straight to the harbor.
  await page.waitForFunction(inHarbor,true,{timeout:30000});
  const first=await page.evaluate(()=>!!document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open]'));
  if(await page.locator('dialog.cutscene[open]').count()){
    await skip.click();await page.waitForFunction(()=>document.querySelector('.tutorial-card[open],.goal-card[open]'),null,{timeout:30000});
  }
  if(await page.locator('.tutorial-card[open]').count())await page.locator('.tutorial-card[open]').getByRole('button',{name:'Skip',exact:true}).click();
  if(first){
    await card.waitFor({timeout:30000});await card.getByRole('button',{name:'Got it',exact:true}).click();
  }
  await page.waitForFunction(inHarbor,null,{timeout:30000});
}
export async function closeSettings(page,{keyboard=false}={}) {
  if(keyboard)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Back',exact:true}).click();
  const resume=page.getByRole('button',{name:'Resume',exact:true});if(await page.locator('.shell-screen[open][data-mode="pause"]').count()){await resume.waitFor();await resume.click();}
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
// Closes any open game panel so a check can continue in the world.
export async function dismissPanels(page) {
  for(const selector of ['.islet-modal','.duel-modal','.sports-modal','.market-modal','.account-modal']){
    const modal=page.locator(`${selector}[open]`);if(await modal.count()){await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});}
  }
}
// The play HUD's Menu (pause) leads to Settings; the old ☷ visual-settings button left with lane U2.
export async function openSettingsFromMenu(page) {
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator('.shell-screen[open][data-mode="pause"]').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.preferences').waitFor();
}
