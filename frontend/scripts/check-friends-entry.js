// Production DOM only: public account snapshots and explicit callbacks, never a renderer or live API.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';

const root=resolve('dist'),manifest=JSON.parse(await readFile(resolve(root,'.vite/manifest.json'),'utf8'));
const pathFor=key=>'/'+manifest[key].file,modalEntry=Object.values(manifest).find(entry=>entry.name==='modal');
const paths={subpages:pathFor('src/shell/subpages.js'),account:pathFor('src/shell/account-host.js'),modal:'/'+modalEntry.file,
  adapter:pathFor('src/online/case-adapter/index.js'),game:pathFor('src/game.js')};
const styles=manifest['index.html'].css.map(href=>`<link rel="stylesheet" href="/${href}">`).join('');
const out=process.env.FRIENDS_CAPTURE_DIR??'captures/friends-entry';await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  if(req.url==='/__friends-review'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head>${styles}</head><body><button id="opener">Open</button></body></html>`);return;}
  const pathname=new URL(req.url,'http://local').pathname,path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  try{const file=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(path)]??'application/octet-stream');res.end(file);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/chromium',headless:true,args:['--disable-gpu']}),report={checks:[],errors:[],external:[]};
const page=await browser.newPage({viewport:{width:320,height:400},reducedMotion:'reduce'});
page.on('pageerror',error=>report.errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('data:'))report.external.push(request.url());});
await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"unavailable","message":"Recorded offline service."}}'}));
async function mount(account,{journal=false,mode='friends',defer=false}={}){
  await page.goto(base+'/__friends-review');
  await page.evaluate(async({paths,account,journal,mode,defer})=>{
    // Shared internal export names are minified; identify the native dialog factory by its capability.
    const modalModule=await import(paths.modal),createModal=Object.values(modalModule).find(value=>typeof value==='function'&&value.toString().includes('.showModal('));
    const {createAccountHost}=await import(paths.account),{fillSubpage}=await import(paths.subpages);
    const body=document.createElement('div'),nav=document.createElement('nav');body.className='shell-body';nav.className='shell-menu';
    const modal=createModal({title:mode==='friends'?'Play with friends':'Made together',body});modal.element.classList.add('shell-screen');modal.element.dataset.mode=mode;modal.open();
    const proof=window.friendsProof={current:true,calls:[],account,modal,body,nav};
    const adapter={read:()=>({mode:'online',account:proof.account}),signIn:async()=>{proof.calls.push(['signIn']);return {accepted:false};}};
    const accountHost=createAccountHost({container:document.body,adapter});proof.accountHost=accountHost;
    const options={mode,body,nav,ctx:{readAccount:()=>proof.account,readSave:()=>journal?'{"version":1,"actions":["to_desk"]}':null,
      openAccount:()=>{proof.calls.push(['account']);return accountHost.open();},onPlay:(...args)=>proof.calls.push(['play',...args])},
      isCurrent:()=>proof.current,play:()=>{proof.current=false;proof.calls.push(['start']);},page(){},show(){},back:()=>{proof.current=false;proof.calls.push(['back']);}};
    proof.open=()=>fillSubpage(options);proof.cleanup=()=>{proof.current=false;accountHost.dispose();modal.dispose();};
    if(!defer)await proof.open();
  },{paths,account,journal,mode,defer});
}
const calls=()=>page.evaluate(()=>window.friendsProof.calls);
const check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
async function visibleActions(label){
  return page.evaluate(label=>{
    const root=document.querySelector('.shell-screen'),body=root.querySelector('.kit-modal-body');
    return body.scrollTop===0&&[label,'Back'].every(text=>{
      const button=[...root.querySelectorAll('button')].find(button=>button.textContent===text),rect=button?.getBoundingClientRect();
      return rect&&rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;
    });
  },label);
}
try{
  await mount({state:'signed_out',canSignIn:true,hasKit:false});
  check((await calls()).length===0,'Opening Friends performs no sign-in or game action');
  const layout=await page.locator('.shell-screen').evaluate(root=>({overflow:root.scrollWidth>root.clientWidth,
    top:root.querySelector('.kit-modal-body').scrollTop,heading:root.querySelector('.kit-heading')===document.activeElement,
    targets:[...root.querySelectorAll('button')].filter(button=>button.getClientRects().length).map(button=>button.getBoundingClientRect().height)}));
  check(!layout.overflow&&layout.top===0&&layout.heading&&layout.targets.every(height=>height>=44),'Friends opens from its introduction with full-size controls at 320x400');
  check(await visibleActions('Account and saves'),'Signed-out primary and Back are visible without scrolling');
  await page.screenshot({path:`${out}/friends-sign-in-320.png`});
  await page.getByRole('button',{name:'Account and saves',exact:true}).click();await page.locator('.account-modal[open]').waitFor();
  assert.deepEqual(await calls(),[['account']]);report.checks.push('Signed-out Friends opens Account only after its button is clicked');
  await page.evaluate(()=>{window.friendsProof.account={state:'signed_in',hasKit:false};window.friendsProof.accountHost.close();});
  await page.getByRole('button',{name:'Start your story',exact:true}).waitFor();
  report.checks.push('Returning from Account refreshes Friends without moving focus');

  for(const fixture of [
    {account:{state:'signed_in',hasKit:false},label:'Start your story',resume:false,crew:false},
    {account:{state:'signed_in',hasKit:false,canContinue:true},label:'Continue your story',resume:true,crew:false},
    {account:{state:'signed_in',hasKit:true},label:'Open your crew',resume:true,crew:true},
    {account:{state:'signed_out',canSignIn:false,signInMessage:'Sign-in opens later.'},label:'Start a new story',resume:false,crew:false},
    {account:{state:'signed_in',hasKit:true,connection:{state:'offline'}},label:'Start a new story',resume:false,crew:false},
    {account:{state:'signed_out',canSignIn:false},journal:true,label:'Continue on this device',resume:true,crew:false},
  ]){
    await mount(fixture.account,{journal:fixture.journal});const button=page.getByRole('button',{name:fixture.label,exact:true});
    check(await visibleActions(fixture.label),`${fixture.label} and Back are visible at 320x400 without scrolling`);
    if(['Start your story','Open your crew'].includes(fixture.label))await page.screenshot({path:`${out}/friends-${fixture.crew?'crew':'story'}-320.png`});
    await button.click();assert.deepEqual(await calls(),[['start'],['play',fixture.resume,undefined,fixture.crew]]);
    check(await page.evaluate(()=>!document.querySelector('canvas')),'Friends stage dispatches only its explicit navigation callback');
  }
  await mount({state:'signed_in',hasKit:true});await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Open your crew',exact:true}).evaluate(button=>button.click());
  assert.deepEqual(await calls(),[['back']]);report.checks.push('Back fences callbacks left on a stale Friends surface');

  await mount({state:'signed_out',canSignIn:true},{defer:true});
  let held;const gate=new Promise(resolve=>held=resolve);let release;
  await page.route('**/assets/friends-*.js',async route=>{held();await new Promise(resolve=>release=resolve);await route.continue();});
  const opening=page.evaluate(()=>window.friendsProof.open());await gate;
  await page.evaluate(()=>{window.friendsProof.current=false;});release();await opening;await page.unroute('**/assets/friends-*.js');
  check(await page.locator('.friends-guide').count()===0,'Cancelled lazy Friends import never installs a stale page');

  for(const conflict of [false,true]){
    await mount({state:'signed_in',hasKit:true,canContinue:!conflict,canReroll:true,captainName:'Captain Lantern',save:{state:conflict?'conflict':'saved',
      device:{state:'saved',label:'A recorded device story with a long description. '.repeat(7)},cloud:{state:'saved',label:'A recorded cloud story with a long description. '.repeat(7)}}});
    await page.evaluate(()=>window.friendsProof.accountHost.open());await page.locator('.account-modal[open] .account-screen').waitFor();
    const proof=await page.locator('.account-modal').evaluate(root=>({top:root.querySelector('.kit-modal-body').scrollTop,
      header:root.querySelector('.kit-modal-header').contains(document.activeElement),status:root.querySelector('.account-status').getBoundingClientRect().top,
      body:root.querySelector('.kit-modal-body').getBoundingClientRect().top}));
    check(proof.top===0&&proof.header&&proof.status>=proof.body,'Long Account opens at its top with header focus');
    await page.screenshot({path:`${out}/account-${conflict?'conflict':'saved'}-320.png`});
  }
  await mount({state:'expired',canSignIn:true,connection:{state:'expired'},save:{state:'idle',
    device:{state:'saved',label:'A recorded device story with a long description. '.repeat(7)},cloud:{state:'idle',label:'No cloud save'}}});
  check(await visibleActions('Account and saves'),'Expired Friends offers a visible Account repair action');
  await page.evaluate(()=>window.friendsProof.accountHost.open());
  const signIn=page.locator('.account-modal [data-focus="account-sign-in"]');await signIn.waitFor();
  check(await signIn.evaluate(button=>{const rect=button.getBoundingClientRect();return button===document.activeElement&&rect.top>=0&&rect.bottom<=innerHeight;}),
    'Expired Account scrolls its focused sign-in action into view');
  await page.screenshot({path:`${out}/account-expired-320.png`});
  await mount({state:'signed_out',canSignIn:false},{mode:'credits'});
  const credits=await page.locator('.shell-screen').evaluate(root=>({top:root.querySelector('.kit-modal-body').scrollTop,
    heading:root.querySelector('.kit-heading')===document.activeElement,team:root.querySelector('.shell-credits').textContent.includes('The team')}));
  check(credits.top===0&&credits.heading&&credits.team,'Credits opens from the introduction with heading focus');
  await page.screenshot({path:`${out}/credits-320.png`});

  // Exercise the real production main/shell request fences, replacing only private transport and GPU factory.
  const account={state:'signed_in',hasKit:true,canContinue:true,captainName:'Recorded captain',canSignIn:true,
    save:{state:'saved',source:'cloud',label:'Recorded progress',device:{state:'idle'},cloud:{state:'saved'}}};
  await page.route(base+paths.adapter,route=>route.fulfill({contentType:'text/javascript',body:`
    export function createRealCaseAdapter(){
      const view={schema:1,mode:'online',revision:1,account:${JSON.stringify(account)},continuation:{source:'cloud',kind:'world',actions:[],place:'lighthouse_isle'}};
      window.friendsRecordedAccount=view.account;
      return {read:()=>structuredClone(view),subscribe:()=>()=>{},tick(){},dispose(){},continueGame:async()=>({accepted:true,view:structuredClone(view)})};
    }`}));
  for(const scenario of ['ready','account','cancel','signed-out','overlay']){
    await page.route(base+paths.game,route=>route.fulfill({contentType:'text/javascript',body:`
      export async function startGame(ctx){window.friendsMainProof={events:[]};return {
        setFestivalAvailable(){},setMode(){},hasOverlay:()=>${scenario==='overlay'},handleEscape:()=>false,dispose(){},
        async begin(){window.friendsMainProof.events.push('begin');
          ${scenario==='account'?'await ctx.openAccount();':scenario==='cancel'?'await new Promise(resolve=>window.friendsMainProof.release=resolve);':scenario==='signed-out'?"window.friendsRecordedAccount.state='signed_out';window.friendsRecordedAccount.hasKit=false;":''}
        },openCrew(){window.friendsMainProof.events.push('crew');}
      };}
    `}));
    await page.goto(base+'/');await page.getByRole('button',{name:'Play with friends',exact:true}).click();
    await page.getByRole('button',{name:'Open your crew',exact:true}).click();
    await page.waitForFunction(()=>window.friendsMainProof?.events.includes('begin'));
    if(scenario==='account')await page.locator('.account-modal[open] .account-screen').waitFor();
    if(scenario==='cancel'){
      await page.keyboard.press('Escape');await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
      await page.evaluate(()=>window.friendsMainProof.release());
    }
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(()=>window.friendsMainProof.events),scenario==='ready'?['begin','crew']:['begin']);
    check(await page.locator('canvas[tabindex]').count()===0,`Real main ${scenario} flow opens Crew only after an unblocked current resume`);
    await page.unroute(base+paths.game);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);console.log(JSON.stringify(report));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
