// Measures built title bytes, confirms on-demand chunks, and checks readable palette contrast.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const captureDir=process.env.CAPTURE_DIR||'captures',prefix=process.env.CAPTURE_PREFIX||'20261105_G5';
await mkdir(captureDir,{recursive:true});
const env=await openWorldBrowser({preview:true}),{page}=env,report={checked:new Date().toISOString(),checks:[]};
const capture=name=>join(captureDir,`${prefix}-${name}`);
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try {
  const manifest=JSON.parse(await readFile('dist/.vite/manifest.json','utf8')),seen=new Set();
  function walk(key){if(seen.has(key))return;seen.add(key);for(const dependency of manifest[key].imports??[])walk(dependency);}
  walk('index.html');report.initialChunks=[];report.initialJavaScript=0;report.initialGzip=0;
  for(const key of seen){const file=manifest[key].file;if(!file.endsWith('.js'))continue;const data=await readFile('dist/'+file);report.initialChunks.push(file);report.initialJavaScript+=data.length;report.initialGzip+=gzipSync(data).length;}
  check(report.initialJavaScript<=21080,'Cold title JavaScript stays within the current 21,080-byte budget');
  const cssFiles=new Set([...seen].flatMap(key=>manifest[key].css??[]));report.initialCss=0;
  for(const file of cssFiles)report.initialCss+=(await readFile('dist/'+file)).length;
  check(report.initialCss<12000,'Cold title CSS is below 12 kB; world styles stay deferred');
  report.lazyEntries=Object.entries(manifest).filter(([,chunk])=>chunk.isDynamicEntry).map(([key,chunk])=>({key,file:chunk.file}));
  for(const entry of ['src/game.js','src/world/cinematics/controller.js','src/world/places/settlement.js','src/world/places/home.js','src/ui/kit-gallery.js','src/ui/cinematic-demo.js','src/screens/board.js','src/screens/finale.js','src/screens/reveal.js','src/world/places/gulls-rest.js','src/world/festival.js'])check(report.lazyEntries.some(chunk=>chunk.key===entry),`${entry} is a separate dynamic entry`);
  const realChunk=manifest['src/online/case-adapter/index.js'];
  check(realChunk?.isDynamicEntry,'Real adapter is a separate dynamic entry');
  await page.addInitScript(()=>{
    const observer=new MutationObserver(()=>{
      if(!document.querySelector('#new-game'))return;
      observer.disconnect();requestAnimationFrame(()=>{
        window.__titleFrame={at:performance.now(),resources:performance.getEntriesByType('resource').map(r=>r.name)};
      });
    });observer.observe(document,{childList:true,subtree:true});
  });
  await stubIntro(page);await page.goto(env.url);await page.locator('.shell-screen[open]').waitFor();
  await page.waitForFunction(()=>!!window.__titleFrame);
  report.titleFrame=await page.evaluate(()=>window.__titleFrame);
  check(!report.titleFrame.resources.some(url=>url.endsWith(realChunk.file)),
    'The first title frame requests no real adapter chunk');
  await page.waitForFunction(file=>performance.getEntriesByType('resource').some(r=>r.name.endsWith(file)),realChunk.file);
  const realStart=await page.evaluate(file=>performance.getEntriesByType('resource').find(r=>r.name.endsWith(file)).startTime,realChunk.file);
  check(realStart>=report.titleFrame.at,'Real adapter loading starts after the first title frame');
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name));check(!loaded.some(url=>url.includes('controller-')||url.includes('settlement-')||url.includes('cinematic-demo-')||url.includes('kit-gallery-')),'Cold title requests no finale, destination, demo or gallery chunk');
  check(await page.locator('canvas[tabindex]').count()===0,'Cold production title allocates no WebGL renderer');
  report.contrast=await page.locator('#new-game').evaluate(button=>{
    function luminance(color){const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;}
    const style=getComputedStyle(button),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  });check(report.contrast>=4.5,'Primary pixel buttons exceed WCAG AA normal-text contrast');await page.screenshot({path:capture('Title.png')});
  await page.setViewportSize({width:375,height:667});check(await page.locator('.shell-logo').evaluate(canvas=>Number.isInteger(canvas.getBoundingClientRect().width/canvas.width)),'Phone title emblem uses an integer pixel scale');await page.setViewportSize({width:1440,height:900});
  await startFromTitle(page);check(await page.evaluate(()=>typeof window.__island)==='undefined','The loaded production world exposes no dev inspection object');
  await page.getByRole('button',{name:'Open visual settings'}).click();await page.locator('[data-preference=quality]').selectOption('low');await page.screenshot({path:capture('Settings.png')});
  check(env.errors.length===0&&env.external.length===0,'Production title and world have no browser errors or external asset requests');console.log(JSON.stringify(report,null,2));
} finally {
  report.browser={pageErrorTypes:env.pageErrors,consoleErrors:env.consoleErrors};
  try {await writeFile(capture('Loading-Checks.json'),JSON.stringify(report,null,2));} finally {await env.close();}
}
