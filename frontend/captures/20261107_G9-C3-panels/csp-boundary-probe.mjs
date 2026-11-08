// Actual enforcing-header/CSP-event negative probe; generated fixture values never leave this process.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openPanelFixture,assertPanelPrivacy} from '../../scripts/online-panel-fixture.js';
import {createRecordedPredictions} from '../../scripts/check-online-predictions.js';
const previousNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='development';
const env=await openPanelFixture({area:'predictions',createService:createRecordedPredictions});
try{
  const config=env.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/config'&&response.status()===200);
  await env.page.goto(env.url);await config;
  assertPanelPrivacy(env);
  assert.equal(process.env.NODE_ENV,'development','Fixture build restores its preceding development environment');
  assert.equal(await env.page.evaluate(()=>!!window.__plotTwist||!!window.__island),false,'A production fixture exposes no DEV inspection hooks');
  const before=env.panelSecurity();
  await Promise.all([
    env.page.waitForEvent('console',{predicate:message=>message.text()==='[recorded panel CSP violation]'}),
    env.page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__recordedInlineExecuted=true';document.head.append(script);}),
  ]);
  const after=env.panelSecurity();
  assert.ok(after.violations>before.violations,'The browser reports an actual blocked inline script');
  assert.equal(await env.page.evaluate(()=>window.__recordedInlineExecuted),undefined,'Enforcing CSP blocks script execution');
  assert.throws(()=>assertPanelPrivacy(env),/securitypolicyviolation/,'The production fixture rejects an actual CSP event');
  await writeFile('/tmp/g9-package2-csp-probe.json',JSON.stringify({checks:6,productionDespitePrecedingDev:true,enforcingDocuments:after.enforcingDocuments,missingEnforcingPolicy:after.missingEnforcingPolicy,actualBlockedEvents:after.violations,inlineDidNotExecute:true,privacyAssertionRejected:true},null,2)+'\n');
  console.log('PASS enforcing CSP header and actual blocked-script/event guard');
}finally{await env.close();if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;}
