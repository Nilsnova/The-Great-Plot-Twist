// Exercise the exact checkpoint header proposal locally. Does not modify deployment settings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle} from './shell-browser-tools.js';

const note=await readFile('../docs/handoff/g16-checkpoint-3.md','utf8');
const proposal=JSON.parse(note.match(/```json\n([\s\S]*?)\n```/)[1]);
const csp=proposal.headers[0].headers.find(header=>header.key==='Content-Security-Policy').value;
const env=await openWorldBrowser({preview:true}),{page}=env;
try {
  await page.addInitScript(()=>{
    window.__cspViolations=[];
    document.addEventListener('securitypolicyviolation',event=>window.__cspViolations.push(event.effectiveDirective));
  });
  await page.route(env.url+'/',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,headers:{...response.headers(),'content-security-policy':csp}});
  });
  await stubIntro(page);await page.goto(env.url);
  await page.locator('.shell-screen[open]').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await startFromTitle(page);
  await page.getByRole('button',{name:'Open visual settings'}).click();
  await page.locator('[data-preference=quality]').selectOption('low');
  assert.deepEqual(await page.evaluate(()=>window.__cspViolations),[]);
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);
  console.log('PASS proposed CSP: production title, settings, intro and WebGL world; 0 violations, browser errors or external requests.');
} finally {await env.close();}
