// Production bulletin gates use public Journal controls and intercepted public reads, with no inspection hooks.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBulletinFixture,openBulletinDrawer,closeBulletinDrawer,
  assertPublicBulletinTraffic,assertBulletinSaveReady,PUBLIC_BULLETIN_TEXT} from './online-bulletin-fixture.js';
import {closeSettings} from './shell-browser-tools.js';
import {checkOnlineBulletinReadFaults} from './online-bulletin-read-faults.js';
import {checkOnlineBulletinChaos} from './online-bulletin-chaos.js';
export {checkOnlineBulletinChaos} from './online-bulletin-chaos.js';

async function auditDrawer(page){
  return page.locator('.case-modal[open]').evaluate(modal=>{
    const screen=modal.querySelector('.bulletin-screen');
    const visible=element=>{const box=element.getBoundingClientRect();
      return box.width>0&&box.height>0&&getComputedStyle(element).visibility!=='hidden'
        &&!element.closest('[hidden],[inert]')
        &&!element.closest('details:not([open])>:not(summary)');};
    const body=[...screen.querySelectorAll('.bulletin-status,.bulletin-lines li,.bulletin-hook p,.bulletin-resets li')].filter(visible);
    const captions=[...screen.querySelectorAll('.bulletin-day,.bulletin-next,.bulletin-hook-status')].filter(visible);
    const controls=[...modal.querySelectorAll('button,select,input,summary,a[href]')].filter(visible);
    const size=element=>parseFloat(getComputedStyle(element).fontSize),box=modal.getBoundingClientRect();
    return {bodyCount:body.length,captionCount:captions.length,controlCount:controls.length,
      bodyMinimum:Math.min(...body.map(size)),captionMinimum:Math.min(...captions.map(size)),
      controlMinimum:Math.min(...controls.map(size)),
      targets:controls.every(element=>{const rect=element.getBoundingClientRect();return rect.width>=44&&rect.height>=44;}),
      fits:box.left>=0&&box.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth
        &&modal.scrollWidth<=modal.clientWidth+1&&screen.scrollWidth<=screen.clientWidth+1};
  });
}
export async function checkOnlineBulletin({openFixture=openBulletinFixture,
  folder='captures/20261107_G9-C3-bulletin',faults=true,publicChaos=true,checkChaos}={}){
  const report={checks:[],layouts:[],requests:[],security:[],coverage:{eventCount:'not observable in production',
    eventProof:'Existing event/conformance checks remain required; no production hook is added.'}};
  const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
  await mkdir(folder,{recursive:true});
  try{
  // Missing and truthy nonbooleans must not import or fetch an opt-in public feature either.
  for(const flag of [undefined,false,'false','true',1,true]){
    const env=await openFixture(),{page}=env;
    try{
      env.setFlag(flag);await page.emulateMedia({reducedMotion:'reduce'});await env.enterWorld();
      check(await page.evaluate(()=>!window.__island&&!window.__plotTwist),'The production journey exposes no inspection object');
      if(flag!==true){
        await page.locator('.hud-actions').getByRole('button',{name:'Journal',exact:true}).click();
        const entry=page.locator('.case-toolbar').getByRole('button',{name:/^(?:Tonight\b|Harbor bulletin$|Bulletin$)/}).first();
        if(await entry.count()&&await entry.isEnabled())await entry.click();
        check(env.reads('/api/bulletin').length===0,'A non-true bulletin flag sends no bulletin GET');
        check(env.runtimeImports().length===0,'A non-true flag imports neither bulletin controller nor drawer');
        check(await page.locator('.case-modal[open] .bulletin-screen').count()===0,
          'A flag-off Journal action cannot open the live bulletin drawer');
      }else{
        await page.locator('.weather-label').filter({hasText:'Rain at sea'}).waitFor();
        check(env.reads('/api/weather').length>0&&env.reads('/api/bulletin').length>0,
          'The world uses real public weather and bulletin read paths');
        const before=await page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'));
        for(const width of [1280,375,320]){
          await page.setViewportSize({width,height:812});const drawer=await openBulletinDrawer(page);
          await drawer.locator('.bulletin-lines li').filter({hasText:PUBLIC_BULLETIN_TEXT}).waitFor();
          check(!/Open-Meteo|CC BY/.test(await drawer.textContent()),'Bulletin keeps provider and licence details in Credits');
          const layout=await auditDrawer(page);report.layouts.push({width,...layout});
          check(layout.bodyCount>0&&layout.captionCount>0&&layout.controlCount>0
            &&layout.bodyMinimum>=18&&layout.captionMinimum>=18&&layout.controlMinimum>=16
            &&layout.targets&&layout.fits,'Bulletin text, targets and wrapping meet the '+width+'px limits');
          await assertBulletinSaveReady(page);
          check(true,'The '+width+'px bulletin capture retains the unique native saved status without Offline or Conflict');
          await page.screenshot({path:folder+'/bulletin-'+width+'.png'});await closeBulletinDrawer(page);
        }
        check(env.runtimeImports().length===2,'True-flag public controls load the actual bulletin controller and drawer');
        await page.getByRole('button',{name:'Open visual settings',exact:true}).click();
        await page.getByRole('button',{name:'Credits',exact:true}).click();await page.locator('.shell-credits').waitFor();
        check((await page.locator('.shell-credits').textContent()).includes('adapted for the game')
          &&await page.getByRole('link',{name:'Open-Meteo',exact:true}).getAttribute('href')==='https://open-meteo.com/'
          &&await page.getByRole('link',{name:'CC BY 4.0',exact:true}).getAttribute('href')==='https://creativecommons.org/licenses/by/4.0/',
          'Settings Credits retains provider, adaptation and licence links');
        await page.getByRole('button',{name:'Back',exact:true}).click();await closeSettings(page,{keyboard:true});
        check(await page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'))===before,
          'Opening and closing the bulletin never changes accepted intro replay');
        check(!/Open-Meteo|CC BY/.test(await page.locator('.hud').textContent()),'Gameplay has no attribution block');
      }
      assertPublicBulletinTraffic(env);report.security.push({context:flag===true?'enabled':'disabled',...env.bulletinSecurity()});report.requests.push(...env.publicRequests);
    }finally{await env.close();}
  }
  if(faults){
    report.readFaults=await checkOnlineBulletinReadFaults({openFixture,folder:folder+'/reads'});
    if(publicChaos)report.publicFaults=await checkOnlineBulletinChaos({checkChaos,openFixture,folder:folder+'/chaos'});
  }
  return report;
  }catch(error){report.failure={type:error.name};throw error;}
  finally{await writeFile(folder+'/online-bulletin.json',JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await (process.argv.includes('--chaos')?checkOnlineBulletinChaos():checkOnlineBulletin()),null,2));
