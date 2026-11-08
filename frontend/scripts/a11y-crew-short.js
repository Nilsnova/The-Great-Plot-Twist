// Short-phone component evidence in the local lab; recorded online journeys prove the server path.
export async function auditCrewShortViewport(page,{capture}={}){
 const previous=page.viewportSize();
 try{
  await page.setViewportSize({width:375,height:400});
  await page.evaluate(async()=>{
   if(!window.__caseLab||window.__caseLab.adapter.read().mode!=='local')throw Error('Short crew audit requires the local component lab.');
   await window.__caseLab.screens.open('crew');
  });
  const dialog=page.locator('.case-modal[open]'),input=dialog.getByRole('textbox',{name:'Crew code',exact:true});
  await input.waitFor({state:'visible'});await input.focus();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const metrics=await dialog.evaluate(async dialog=>{
   const h=await import('/scripts/a11y-helpers.js'),crew=dialog.querySelector('.case-crew');
   const input=crew.querySelector('[data-focus="join-code"]'),rect=input.getBoundingClientRect();
   const clip=dialog.querySelector('.case-screen-content').getBoundingClientRect(),viewport={width:innerWidth,height:innerHeight};
   const controls=[...crew.querySelectorAll('button,input,select,a[href],summary')].filter(el=>h.renderedForAudit(el));
   const body=[...crew.querySelectorAll('p,h3')].filter(el=>h.renderedForAudit(el)&&el.textContent.trim());
   const minimum=values=>values.length?Math.min(...values):0;
   return {viewport,focused:document.activeElement===input,enabled:!input.disabled,rendered:h.renderedForAudit(input),
    autocapitalize:input.getAttribute('autocapitalize'),inputmode:input.getAttribute('inputmode'),
    field:{width:rect.width,height:rect.height,size:parseFloat(getComputedStyle(input).fontSize),
     insideViewport:h.withinViewport(rect,viewport),insideContent:rect.left>=clip.left-1&&rect.top>=clip.top-1&&rect.right<=clip.right+1&&rect.bottom<=clip.bottom+1,
     hit:document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===input},
    controls:{count:controls.length,smallTargets:controls.filter(el=>!h.touchTargetMeetsMinimum(el.getBoundingClientRect())).length,
     minimumSize:minimum(controls.map(el=>parseFloat(getComputedStyle(el).fontSize)))},
    body:{count:body.length,minimumSize:minimum(body.map(el=>parseFloat(getComputedStyle(el).fontSize)))},
    overflow:h.hasHorizontalOverflow(crew)||h.hasHorizontalOverflow(document.documentElement),
    dialogFits:h.withinViewport(dialog.getBoundingClientRect(),viewport)};
  });
  const checks={focusedCode:metrics.focused&&metrics.enabled&&metrics.rendered&&metrics.field.insideViewport&&metrics.field.insideContent&&metrics.field.hit,
   codeKeyboard:['characters','on'].includes(metrics.autocapitalize)&&['text','latin'].includes(metrics.inputmode),
   crewTargets:metrics.controls.count>0&&metrics.controls.smallTargets===0,
   crewText:metrics.controls.count>0&&metrics.body.count>0&&metrics.controls.minimumSize>=16&&metrics.field.size>=16&&metrics.body.minimumSize>=18,
   crewOverflow:!metrics.overflow&&metrics.dialogFits};
  if(capture)await page.screenshot({path:capture});
  return {fixture:'local-component-lab',metrics,checks};
 }finally{
  try{await page.evaluate(()=>window.__caseLab?.screens.close());}
  finally{if(previous)await page.setViewportSize(previous);}
 }
}
