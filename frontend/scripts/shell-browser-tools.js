// Starts the Lighthouse prologue (the original Act 1) from Settings > Story, from the title, pause or
// Settings itself. The prologue resumes a saved local intro, as Continue did before the G29 front door.
export async function startPrologue(page){
  const shell=page.locator('.shell-screen[open]');await shell.waitFor();
  if(await shell.getAttribute('data-mode')!=='settings')await shell.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.shell-screen[open][data-mode="settings"]').getByRole('button',{name:'Lighthouse prologue',exact:true}).click();
}
// The old title's New game: the prologue from its first page. A finished prologue resumes at its
// ending, whose own "Start a new intro" control begins again; an unfinished one is never thrown away.
export async function startFreshPrologue(page){
  await startPrologue(page);
  const view=page.locator('.intro-modal[open] .intro-view');await view.waitFor();
  const saved=await page.evaluate(()=>{try{const saved=JSON.parse(localStorage.getItem('plot_twist_intro_moves_v1'));return Array.isArray(saved?.actions)&&saved.actions.length>0;}catch{return false;}});
  if(!saved)return;
  for(let count=0;count<30&&await view.getAttribute('data-stage')!=='arrival';count+=1){
    const next=page.locator('.intro-modal [data-choice="intro:next"]');if(!await next.count())break;
    await page.locator('.intro-modal .kit-dialogue').evaluate(dialogue=>{const skip=[...dialogue.querySelectorAll('button')].find(button=>button.textContent==='Show full text');if(skip&&!skip.hidden)skip.click();});
    await next.click();
  }
  const restart=page.locator('.intro-modal .intro-ending').getByRole('button',{name:'Start a new intro',exact:true});
  if(await restart.isVisible())await restart.click();
}
// Since G29 the friends and crew flow opens from Join with a crew code; the title has Play, Join and Settings.
export async function openFriendsThroughJoin(page,code='K7QF2M'){
  await page.locator('.shell-screen[open][data-mode="title"] .shell-menu').getByRole('button',{name:'Join',exact:true}).click();
  const form=page.locator('.join-form');await form.getByRole('textbox',{name:'Code'}).fill(code);
  await form.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.shell-screen[open][data-mode="friends"]').waitFor();
}
// Starts through the actual title menu. Shared graphics checks can then exercise the world.
export async function startFromTitle(page,{resume=false,closeIntro=true,closeInterior=closeIntro}={}) {
  await page.locator('.shell-screen[open]').waitFor();
  if(resume)await page.locator('#play').click();else await startFreshPrologue(page);
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
  const resume=page.getByRole('button',{name:'Resume',exact:true});if(await page.locator('.shell-screen[open][data-mode="pause"]').count()){await resume.waitFor();await resume.click();}
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
}
