// Real provider signup, production auth restoration and ordinary rendered game entry.
import {mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {loadRuntime} from './runtime.mjs';
import {servedSourceEvidence} from './source.mjs';
export {loadRuntime} from './runtime.mjs';

export async function api(page,path,{method='GET',body,headers={},capability='1'}={}) {
 if(page.kind==='api-only')return page.request(path,{method,body,headers,capability});
 return page.evaluate(async({path,method,body,headers,capability})=>{
  const {session}=await import('/src/online/session.js');
  const token=session.getToken();
  const requestHeaders={...(body===undefined?{}:{'Content-Type':'application/json'}),...headers};
  if(token)requestHeaders.Authorization='Bearer '+token;
  if(capability!==null)requestHeaders['X-Island-Economy-Version']=capability;
  const response=await fetch(path,{method,headers:requestHeaders,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>null);
  return {status:response.status,data};
 },{path,method,body,headers,capability});
}

export async function createClients({labels=['owner','member'],runtimePath,expectedCommit,
 viewport={width:1280,height:800},verify=true,independentBrowsers=true}={}) {
 const runtime=await loadRuntime(runtimePath);
 if(expectedCommit!==undefined&&expectedCommit!==runtime.expectedCommit)throw Error('The requested candidate differs from the configured provider candidate');
 const sources=servedSourceEvidence(runtime);
 if(!runtime.certificateSpki)throw Error('Provider certificate pin is missing');
 const launch=()=>chromium.launch({executablePath:'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
   '--ignore-certificate-errors-spki-list='+runtime.certificateSpki]});
 const clients=[],browsers=[];
 try {
  for(const label of labels) {
   const browser=independentBrowsers||browsers.length===0?await launch():browsers[0];
   if(!browsers.includes(browser))browsers.push(browser);
   const context=await browser.newContext({viewport});
   const page=await context.newPage();
   const email=`${label}-${randomBytes(6).toString('hex')}@example.test`;
   const password=randomBytes(24).toString('base64url');
   await page.goto(runtime.frontendUrl,{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(async({url,key,email,password})=>{
    const {createAuthClient}=await import('/src/online/supabase-sdk.js');
    const client=createAuthClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const answer=await client.auth.signUp({email,password});
    if(answer.error||!answer.data.session)throw Error('Actual provider signup failed: '+(answer.error?.status??'no session'));
    const session=answer.data.session;
    sessionStorage.setItem('plot-twist-auth-v1',JSON.stringify(session));
    client.auth.stopAutoRefresh();
    return {actorId:answer.data.user.id,session};
   },{url:runtime.providerUrl,key:runtime.anonKey,email,password});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(async()=>{const {session}=await import('/src/online/session.js');return session.isSignedIn();},null,{timeout:30000});
   let me;
   for(let attempt=0;attempt<30;attempt++) {
    me=await api(page,'/api/me');
    if(me.status===200&&me.data.id===result.actorId)break;
    await page.waitForTimeout(100);
   }
   if(verify&&(me.status!==200||me.data.id!==result.actorId))throw Error('Production verifier did not accept actual provider identity: '+JSON.stringify(me));
   clients.push({label,page,context,browser,actorId:result.actorId,session:result.session,email,password});
  }
  return {runtime,clients,servedSources:sources,close:()=>Promise.all(browsers.map(browser=>browser.close()))};
 } catch(error) {await Promise.all(browsers.map(browser=>browser.close()));throw error;}
}

export async function land(page,{create=false,join=null}={}) {
 const play=page.locator('#play');
 if(await play.isVisible().catch(()=>false))await play.click({noWaitAfter:true});
 for(let attempt=0;attempt<60;attempt++) {
  const skip=page.getByRole('button',{name:'Skip',exact:true}).first();
  if(await skip.isVisible().catch(()=>false)) {
   await skip.click({timeout:5000,noWaitAfter:true});
  } else if(await page.locator('.games-card[open]').count()) {
   try {
    if(join){await page.locator('.games-card[open] .games-code').fill(join,{timeout:5000});await page.locator('.games-card[open]').getByRole('button',{name:'Join',exact:true}).click({timeout:5000,noWaitAfter:true});}
    else if(create)await page.locator('.games-card[open]').getByRole('button',{name:'Create a game',exact:true}).click({timeout:5000,noWaitAfter:true});
    else {const button=page.locator('.games-card[open] .games-pick').first();if(await button.count())await button.click({timeout:5000,noWaitAfter:true});}
   } catch(error) {
    // Initial lore can replace the game dialog between observation and input.
    if(error.name!=='TimeoutError'||(!await skip.isVisible().catch(()=>false)&&!await page.locator('.games-card[open]').count()))throw error;
   }
  } else if(await page.locator('.goal-card[open]').count()) {
   await page.locator('.goal-card[open]').getByRole('button',{name:'Got it',exact:true}).click({noWaitAfter:true});
  } else if(await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) {
   await page.getByRole('button',{name:'Skip',exact:true}).first().click({timeout:2000}).catch(()=>{});
  }
  const ready=await page.evaluate(()=>window.__island?.world.current?.id==='home_islet'
   &&!!(window.__island.island?.visiting??window.__island.island?.island));
  if(ready)return;
  await page.waitForTimeout(250);
 }
 throw Error('Ordinary rendered game entry did not reach the island');
}

export async function capture(page,directory,name) {
 await mkdir(directory,{recursive:true});
 await page.screenshot({path:`${directory}/${name}.png`});
}
