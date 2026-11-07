// Native Account host/screen over the real A2+adapter expiry path; every endpoint is injected.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
const visibleCalls=page=>page.locator('.account-modal .server-call:visible');

async function mount(page){
  await page.evaluate(async()=>{
    await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
    const {createAccountHost}=await window.g20Import('/src/shell/account-host.js');
    const {createRealCaseAdapter}=await window.g20Import('/src/online/case-adapter/index.js');
    const {createSession}=await window.g20Import('/src/online/session.js');
    const {createApi}=await window.g20Import('/src/online/api.js');
    const {intentFailure}=await window.g20Import('/src/adapter/intent.js');
    const {INTRO_JOURNAL_KEY}=await window.g20Import('/src/story/intro-journal.js');
    const session=createSession();session.setToken(`fixture-${crypto.randomUUID()}`);
    const journal=JSON.stringify({version:1,actions:['to_desk']});localStorage.setItem(INTRO_JOURNAL_KEY,journal);
    const proof=window.accountExpiryProof={failName:false,journal,requests:[],secret:`private-${crypto.randomUUID()}`};
    const me={id:crypto.randomUUID(),captainName:'Recorded private captain',coins:0,kit:'stranger',place:'saltreach_harbor',crews:[]};
    const crew={id:crypto.randomUUID(),code:'RECORDED',status:'active',mode:'solo',mySeat:1,
      seats:[1,2,3,4].map(seatNo=>({seatNo,holder:seatNo===1?'player':'partner',isMe:seatNo===1,
        name:seatNo===1?me.captainName:'Recorded partner',kit:'stranger'}))};
    const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    const api=createApi({session,fetchImpl:async(path,options)=>{
      proof.requests.push({path,method:options.method});
      if(path==='/api/islet'||proof.failName&&path==='/api/me/name/reroll')return respond(401,{error:{code:'unauthorized',message:proof.secret}});
      if(path==='/api/config')return respond(200,{flags:{sign_in:true,live_presence:false}});
      if(path==='/api/me')return respond(200,me);
      if(path==='/api/me/name')return respond(200,{captainName:me.captainName,rerollsLeft:1});
      if(path==='/api/crews/me')return respond(200,{crew});
      if(path==='/api/save')return respond(200,{version:1,data:{},updatedAt:null});
      throw new Error('Unexpected recorded account route.');
    }});
    const auth={read:()=>({state:session.isSignedIn()?'signed_in':'expired',configured:true,message:''}),
      readOwnLedger:async()=>({ok:true,rows:[]}),dispose(){}};
    const adapter=createRealCaseAdapter({session,api,publicApi:api,auth,document:{},window:{location:{search:''}}});
    const host=createAccountHost({container:document.body,adapter});
    let noticed='';
    const sync=view=>{
      host.update(view);const key=JSON.stringify(view.account);
      if(view.account.state==='expired'&&noticed!==key){noticed=key;proof.openTask=host.open();}
    };
    const off=adapter.subscribe(event=>sync(event.view));sync(adapter.read());
    Object.assign(proof,{host,adapter,session,
      async expire(){proof.raw=await api.get('/api/islet');await proof.openTask;},
      repeatNotice(){host.notice(intentFailure(proof.raw));},
      restore(){proof.failName=false;session.setToken(`fixture-${crypto.randomUUID()}`);},
      read(){return {view:adapter.read(),signedIn:session.isSignedIn(),journalKept:localStorage.getItem(INTRO_JOURNAL_KEY)===journal};},
      dispose(){off();host.dispose();adapter.dispose();}});
  });
  await page.waitForFunction(()=>window.accountExpiryProof.adapter.read().account.canReroll&&window.accountExpiryProof.adapter.read().crew.status==='active');
}
async function dispose(page){await page.evaluate(()=>window.accountExpiryProof?.dispose());}
async function settledSignIn(page){
  await page.waitForFunction(()=>{const button=document.querySelector('[data-focus="account-sign-in"]');return button&&!button.disabled&&document.querySelector('.account-modal')?.open;});
}

it('shows genuine external A2 expiry as one shared expired state with report and focused sign-in, preserving the journal',async()=>{
  await evaluate.withPage(async page=>{
    try{
      await mount(page);await page.evaluate(()=>window.accountExpiryProof.expire());await settledSignIn(page);
      expect(await visibleCalls(page).count()).toBe(1);expect(await visibleCalls(page).getAttribute('data-state')).toBe('expired');
      expect(await visibleCalls(page).getByRole('link',{name:'Report a problem',exact:true}).count()).toBe(1);
      expect(await page.evaluate(()=>document.activeElement?.dataset.focus)).toBe('account-sign-in');
      expect(await page.evaluate(()=>{const proof=window.accountExpiryProof,state=proof.read();return {status:proof.raw.status,
        signedIn:state.signedIn,account:state.view.account.state,name:state.view.account.captainName,crew:state.view.crew.code,
        cloud:state.view.account.save.cloud.state,device:state.view.account.save.device.state,journalKept:state.journalKept,
        secretShown:document.querySelector('.account-modal').textContent.includes(proof.secret)};})).toEqual({status:401,signedIn:false,
        account:'expired',name:null,crew:null,cloud:'idle',device:'saved',journalKept:true,secretShown:false});
      await page.evaluate(()=>window.accountExpiryProof.repeatNotice());
      expect(await visibleCalls(page).count()).toBe(1);expect(await visibleCalls(page).getByRole('link',{name:'Report a problem',exact:true}).count()).toBe(1);
      await page.evaluate(()=>window.accountExpiryProof.host.close());expect(await visibleCalls(page).count()).toBe(0);
      await page.evaluate(()=>window.accountExpiryProof.host.open());await settledSignIn(page);
      expect(await visibleCalls(page).count()).toBe(1);expect(await visibleCalls(page).getAttribute('data-state')).toBe('expired');
      expect(await page.evaluate(()=>document.activeElement?.dataset.focus)).toBe('account-sign-in');
      await page.evaluate(()=>window.accountExpiryProof.restore());
      await page.waitForFunction(()=>window.accountExpiryProof.adapter.read().account.canReroll);
      expect(await visibleCalls(page).count()).toBe(0);expect(await page.evaluate(()=>window.accountExpiryProof.read().journalKept)).toBe(true);
    }finally{await dispose(page);}
  });
});

it('uses the same single shared state for an Account action 401 without an external duplicate report',async()=>{
  await evaluate.withPage(async page=>{
    try{
      await mount(page);await page.evaluate(()=>window.accountExpiryProof.host.open());
      await page.evaluate(()=>{window.accountExpiryProof.failName=true;});
      await page.getByRole('button',{name:'Change captain name once',exact:true}).click();await settledSignIn(page);
      expect(await visibleCalls(page).count()).toBe(1);expect(await visibleCalls(page).getAttribute('data-state')).toBe('expired');
      expect(await visibleCalls(page).getByRole('link',{name:'Report a problem',exact:true}).count()).toBe(1);
      expect(await page.evaluate(()=>window.accountExpiryProof.read().journalKept)).toBe(true);
      expect(await page.locator('[data-focus="account-sign-in"]').isEnabled()).toBe(true);
      expect(await page.evaluate(()=>window.accountExpiryProof.adapter.read().crew.code)).toBeNull();
    }finally{await dispose(page);}
  });
});
