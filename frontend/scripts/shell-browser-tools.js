// Starts through the actual title menu. Shared graphics checks can then exercise the world.
export async function startFromTitle(page,{resume=false,closeIntro=true,closeInterior=closeIntro}={}) {
  await page.locator('.shell-screen[open]').waitFor();
  await page.getByRole('button',{name:resume?'Continue':'New game',exact:true}).click();
  await page.locator('.intro-modal[open] .intro-view').waitFor();
  if(closeIntro){
    const roomScene=await page.locator('.intro-view').getAttribute('data-scene');
    if(['cottage','desk','shore','stairwell','lamp_room'].includes(roomScene))await page.locator('.interiors-scene:not([hidden])').waitFor();
    await page.keyboard.press('Escape');await page.locator('.intro-modal').waitFor({state:'hidden'});}
  // Generic world checks begin outside. Room-specific checks keep this scene open explicitly.
  if(closeInterior){const room=page.locator('.interiors-scene:not([hidden])');if(await room.count()){await page.getByRole('button',{name:'Leave room',exact:true}).click();await room.waitFor({state:'hidden'});}}
}
export async function closeSettings(page,{keyboard=false}={}) {
  if(keyboard)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Back',exact:true}).click();
  const resume=page.getByRole('button',{name:'Resume',exact:true});if(await resume.isVisible())await resume.click();
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
