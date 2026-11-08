// Public GET recovery is separate from write-chaos assumptions about sign-in, save conflicts and cooldowns.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openBulletinFixture,openBulletinDrawer,retryBulletin,nextBulletinRead,
  assertPublicBulletinTraffic,PUBLIC_BULLETIN_TEXT} from './online-bulletin-fixture.js';

export async function checkOnlineBulletinReadFaults({openFixture=openBulletinFixture,
  folder='captures/20261107_G9-C3-bulletin/reads'}={}){
  const env=await openFixture({clock:true}),{page}=env;
  const report={checks:[],requests:env.publicRequests,covered:[],planned:['network failure','502','503 bulletin_unavailable','404 feature_off'],
    pending:['Generic write-chaos 401/409/429 matrix is not claimed for this public GET'],
    clock:'Controlled browser timers only; no server clock or product inspection hook'};
  const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
  const count=()=>env.reads('/api/bulletin').length;
  const unavailable=()=>page.locator('.case-modal[open] .bulletin-status').filter({hasText:/unavailable/i}).waitFor();
  async function retryAs(kind,text){
    env.setReply(kind,text);const next=nextBulletinRead(page);await retryBulletin(page);await next;
  }
  async function afterDelay(delay){
    const before=count();await page.clock.fastForward(delay-1);
    check(count()===before,'A failed public read waits its full '+delay+'ms retry delay');
    const next=nextBulletinRead(page);await page.clock.fastForward(1);await next;await unavailable();
    check(count()===before+1,'One public read retries at the '+delay+'ms deadline');
  }
  try{
    await mkdir(folder,{recursive:true});env.setFlag(true);env.setReply('offline');
    await page.emulateMedia({reducedMotion:'reduce'});await env.enterWorld();await openBulletinDrawer(page);await unavailable();
    const journal=await page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'));
    await page.clock.pauseAt((await page.evaluate(()=>Date.now()))+1000);
    // A legitimate manual retry resets this read's schedule at the now-paused browser clock.
    await retryAs('offline');await unavailable();report.covered.push('network failure');
    await afterDelay(5000);env.setReply('gateway');await afterDelay(15000);report.covered.push('502');env.setReply('offline');await afterDelay(30000);
    const exhausted=count();await page.clock.fastForward(60000);
    check(count()===exhausted,'After three failed retries the public read waits for a manual action');
    await retryAs('ready');
    const lines=page.locator('.case-modal[open] .bulletin-lines li');await lines.filter({hasText:PUBLIC_BULLETIN_TEXT}).waitFor();
    check(true,'A public Retry bulletin action recovers the recorded authoritative lines');
    const cached=count();await page.clock.fastForward(299999);
    check(count()===cached,'A successful bulletin remains cached for the first 299999ms');
    env.setReply('offline');const refresh=nextBulletinRead(page);await page.clock.fastForward(1);await refresh;
    await page.locator('.case-modal[open] .bulletin-status').filter({hasText:/last posted bulletin|latest update.*unavailable/i}).waitFor();
    check(count()===cached+1,'The successful five-minute cache expires with one public read');
    check((await lines.allTextContents()).some(text=>text.includes(PUBLIC_BULLETIN_TEXT)),
      'A network failure keeps last-good lines with a visible stale explanation');
    await retryAs('ready','Recorded replacement public bulletin.');
    await lines.filter({hasText:'Recorded replacement public bulletin.'}).waitFor();
    env.setReply('unavailable');const unavailableRead=nextBulletinRead(page);
    await page.clock.fastForward(300000);await unavailableRead;await unavailable();report.covered.push('503 bulletin_unavailable');
    check(await lines.count()===0,'503 bulletin_unavailable shows unavailable without invented or retained lines');
    env.setReply('off');const off=nextBulletinRead(page);await page.clock.fastForward(5000);await off;
    await page.locator('.case-modal[open] .bulletin-screen').waitFor({state:'hidden'});
    report.covered.push('404 feature_off');const stopped=count();await page.clock.fastForward(60000);
    check(count()===stopped,'404 feature_off closes the bulletin and stops automatic public reads');
    check(await page.evaluate(()=>localStorage.getItem('plot_twist_intro_moves_v1'))===journal,
      'Public read failures and retries never alter accepted replay');
    assertPublicBulletinTraffic(env);return report;
  }catch(error){report.failure={type:error.name};throw error;}
  finally{try{await writeFile(folder+'/online-bulletin-reads.json',JSON.stringify(report,null,2)+'\n');}finally{await env.close();}}
}
