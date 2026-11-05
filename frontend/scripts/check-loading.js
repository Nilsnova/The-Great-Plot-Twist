// Measures built title bytes, confirms on-demand chunks, and checks readable palette contrast.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';
const env=await openWorldBrowser({preview:true}),{page}=env,report={checked:new Date().toISOString(),checks:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try {
  const manifest=JSON.parse(await readFile('dist/.vite/manifest.json','utf8')),seen=new Set();
  function walk(key){if(seen.has(key))return;seen.add(key);for(const dependency of manifest[key].imports??[])walk(dependency);}
  walk('index.html');report.initialChunks=[];report.initialJavaScript=0;report.initialGzip=0;
  for(const key of seen){const file=manifest[key].file;if(!file.endsWith('.js'))continue;const data=await readFile('dist/'+file);report.initialChunks.push(file);report.initialJavaScript+=data.length;report.initialGzip+=gzipSync(data).length;}
  check(report.initialJavaScript<35000,'Cold title JavaScript is below 35 kB before gzip');
  report.lazyEntries=Object.entries(manifest).filter(([,chunk])=>chunk.isDynamicEntry).map(([key,chunk])=>({key,file:chunk.file}));
  for(const entry of ['src/game.js','src/world/cinematics/controller.js','src/world/places/settlement.js','src/world/places/home.js','src/ui/kit-gallery.js','src/ui/cinematic-demo.js','src/screens/board.js','src/screens/finale.js','src/screens/reveal.js','src/world/places/gulls-rest.js','src/world/festival.js'])check(report.lazyEntries.some(chunk=>chunk.key===entry),`${entry} is a separate dynamic entry`);
  await stubIntro(page);await page.goto(env.url);await page.locator('.shell-screen[open]').waitFor();
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name));check(!loaded.some(url=>url.includes('controller-')||url.includes('settlement-')||url.includes('cinematic-demo-')||url.includes('kit-gallery-')),'Cold title requests no finale, destination, demo or gallery chunk');
  check(await page.locator('canvas[tabindex]').count()===0,'Cold production title allocates no WebGL renderer');
  report.contrast=await page.locator('#new-game').evaluate(button=>{
    function luminance(color){const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;}
    const style=getComputedStyle(button),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  });check(report.contrast>=4.5,'Primary pixel buttons exceed WCAG AA normal-text contrast');await page.screenshot({path:'captures/20261105_G5-Title.png'});
  await page.setViewportSize({width:375,height:667});check(await page.locator('.shell-logo').evaluate(canvas=>Number.isInteger(canvas.getBoundingClientRect().width/canvas.width)),'Phone title emblem uses an integer pixel scale');await page.setViewportSize({width:1440,height:900});
  await startFromTitle(page);check(await page.evaluate(()=>typeof window.__island)==='undefined','The loaded production world exposes no dev inspection object');
  await page.getByRole('button',{name:'Open visual settings'}).click();await page.locator('[data-preference=quality]').selectOption('low');await page.screenshot({path:'captures/20261105_G5-Settings.png'});
  check(env.errors.length===0&&env.external.length===0,'Production title and world have no browser errors or external asset requests');console.log(JSON.stringify(report,null,2));
} finally {await writeFile('captures/20261105_G5-Loading-Checks.json',JSON.stringify(report,null,2));await env.close();}
