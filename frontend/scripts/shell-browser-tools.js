// Starts through the actual title menu. Shared graphics checks can then exercise the world.
export async function startFromTitle(page,{resume=false,closeIntro=true}={}) {
  await page.locator('.shell-screen[open]').waitFor();
  await page.getByRole('button',{name:resume?'Continue':'New game',exact:true}).click();
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  if(closeIntro){await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});}
}
export async function closeSettings(page,{keyboard=false}={}) {
  if(keyboard)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Back',exact:true}).click();
  const resume=page.getByRole('button',{name:'Resume',exact:true});if(await page.locator('.shell-screen[open][data-mode="pause"]').count()){await resume.waitFor();await resume.click();}
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
