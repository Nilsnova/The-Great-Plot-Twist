// Reuse the production Bulletin fixture; retain only enforcing-policy counters.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openBulletinFixture,openBulletinDrawer,assertPublicBulletinTraffic} from '../../scripts/online-bulletin-fixture.js';
const env=await openBulletinFixture();
try{
  env.setFlag(true);await env.enterWorld();await openBulletinDrawer(env.page);assertPublicBulletinTraffic(env);
  const before=env.bulletinSecurity();
  await Promise.all([
    env.page.waitForEvent('console',{predicate:message=>message.text()==='[recorded bulletin CSP violation]'}),
    env.page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__recordedBulletinInlineExecuted=true';document.head.append(script);}),
  ]);
  const after=env.bulletinSecurity();
  assert.ok(after.enforcingDocuments>0&&after.missingEnforcingPolicy===0,'Every document has an enforcing header');
  assert.ok(after.violations>before.violations,'An actual blocked inline script emits a counted CSP event');
  assert.equal(await env.page.evaluate(()=>window.__recordedBulletinInlineExecuted),undefined,'Inline script did not execute');
  assert.throws(()=>assertPublicBulletinTraffic(env),/securitypolicyviolation/,'The fixture rejects an actual CSP event');
  await writeFile('/tmp/g9-package3-csp-probe.json',JSON.stringify({checks:5,enforcingDocuments:after.enforcingDocuments,missingEnforcingPolicy:after.missingEnforcingPolicy,actualBlockedEvents:after.violations,inlineDidNotExecute:true,privacyAssertionRejected:true},null,2)+'\n');
  console.log('PASS authenticated Bulletin enforcing headers and actual CSP event rejection');
}finally{await env.close();}
