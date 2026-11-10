// Starts through the actual title menu: Play, the lore cutscene (skipped), the goal card and Saltreach
// Harbor. Shared graphics checks then exercise the world. The Lighthouse prologue left on 10 Nov (D031).
export async function startFromTitle(page) {
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  const skip=page.getByRole('button',{name:'Skip',exact:true}),card=page.locator('.goal-card[open]');
  // The lore and the card show once per device; a later Play goes straight to the harbor.
  await page.waitForFunction(()=>document.querySelector('dialog.cutscene[open],.goal-card[open]')
    ||(window.__island?.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]')),null,{timeout:30000});
  if(await page.locator('dialog.cutscene[open]').count())await skip.click();
  if(await card.count()||await page.locator('dialog.cutscene[open]').count()){
    await card.waitFor({timeout:30000});await card.getByRole('button',{name:'Got it',exact:true}).click();
  }
  await page.waitForFunction(()=>window.__island?.world.current?.id==='saltreach_harbor'&&!document.querySelector('dialog[open]'),null,{timeout:30000});
}
export async function closeSettings(page,{keyboard=false}={}) {
  if(keyboard)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Back',exact:true}).click();
  const resume=page.getByRole('button',{name:'Resume',exact:true});if(await page.locator('.shell-screen[open][data-mode="pause"]').count()){await resume.waitFor();await resume.click();}
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
// Closes any open game panel so a check can continue in the world.
export async function dismissPanels(page) {
  for(const selector of ['.islet-modal','.duel-modal','.desk-modal','.sports-modal','.market-modal','.account-modal']){
    const modal=page.locator(`${selector}[open]`);if(await modal.count()){await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});}
  }
}
