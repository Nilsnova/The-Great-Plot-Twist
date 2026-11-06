// Inspect issue-draft links without navigating to GitHub or submitting any data.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const env=await openWorldBrowser({preview:true}),{page}=env,stamp=JSON.parse(await readFile('dist/build-stamp.json','utf8'));
const report={checks:[]},check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
async function draft(){
  const link=page.getByRole('link',{name:'Report a problem',exact:true});await link.waitFor();
  await link.evaluate(el=>{el.addEventListener('click',event=>event.preventDefault(),{once:true});el.click();});
  const url=new URL(await link.getAttribute('href'));
  check(url.origin+url.pathname==='https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new'&&url.href.length<7000,'Issue URL has the fixed destination and stays below 7,000 characters');
  return url.searchParams.get('body');
}
try{
  await stubIntro(page);await page.goto(env.url);await page.getByRole('button',{name:'Settings',exact:true}).click();
  let body=await draft();check(body.includes(`Build: ${stamp.sha}`)&&body.includes('Place: not_started'),'Settings draft contains the build identity and no invented place');
  await page.evaluate(()=>{const button=document.createElement('button');button.textContent='PRIVATE_PLAYER_NAME';button.dataset.focus='PRIVATE_PLAYER_ID';document.querySelector('.preferences').append(button);button.click();button.remove();});
  await page.setViewportSize({width:375,height:667});body=await draft();
  check(body.includes('375 × 667')&&!body.includes('PRIVATE_'),'Viewport updates while arbitrary UI labels/ids are excluded');
  check(body.endsWith('## What happened?\n\n'),'What happened section stays empty');
  await page.getByRole('link',{name:'Report a problem',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'captures/20261106_G9-Report-Settings-375.png'});
  await page.keyboard.press('Escape');await startFromTitle(page);await page.keyboard.press('Escape');
  body=await draft();check(body.includes('Place: lighthouse_isle')&&body.includes('- pause'),'Pause has a draft with the public current place and semantic UI actions');
  check(body.split('Last UI actions:\n')[1].split('\n\n## What happened?')[0].split('\n').filter(line=>line.startsWith('- ')).length<=10,'History is bounded to ten action names');
  await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{id:'PRIVATE_DEVICE_ID',connected:true,mapping:'standard',axes:[.4,0],buttons:Array.from({length:17},()=>({pressed:false}))}]}));
  await page.waitForTimeout(120);body=await draft();check(body.includes('Input: gamepad')&&!body.includes('PRIVATE_DEVICE_ID'),'Gamepad input is a coarse enum, without its device id');
  await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
  await page.getByRole('link',{name:'Report a problem',exact:true}).dispatchEvent('pointerdown',{pointerType:'touch'});body=await draft();check(body.includes('Input: touch'),'Touch input is recorded as a coarse enum');
  await page.screenshot({path:'captures/20261106_G9-Report-Pause-375.png'});
  check(env.errors.length===0&&env.external.length===0,'Inspecting a report makes no external request and produces no browser errors');
  console.log(JSON.stringify(report,null,2));
}finally{await writeFile('captures/20261106_G9-Report-Checks.json',JSON.stringify(report,null,2)+'\n');await env.close();}
