// Fast title entry. One adapter is shared by title, account and the lazily loaded world.
import './ui/base.css';
import './ui/kit/kit.css';
import './ui/shell.css';
import {createShell} from './shell/controller.js';
import {createLazyAccountHost} from './shell/lazy-account.js';
import {createClientAdapter} from './adapter/select.js';
async function sendIntent(...args){return (await (await loadWorld()).loadIntentModule()).sendIntent(...args);}
import {createLazyAudio} from './audio/lazy.js';
import {createCaptions} from './audio/captions.js';
import {on,emit} from './core/events.js';
import {node} from './ui/kit/dom.js';

const container=document.querySelector('#game'),backdrop=node('img','title-backdrop');
backdrop.src=`${import.meta.env.BASE_URL}places/title.webp`;backdrop.onerror=()=>{backdrop.onerror=null;backdrop.src=`${import.meta.env.BASE_URL}places/title.png`;};backdrop.alt='';container.append(backdrop);
const captions=createCaptions(container),audio=createLazyAudio({container,on,caption:captions.show});
let stopMotion=null;
const adapter=await createClientAdapter();
async function ensureMotion(){if(!stopMotion)stopMotion=(await import('./settings/preferences.js')).watchSystemMotion();}
let runtime=null,pending=null,disposed=false,loading=false,playRequest=0,shell,lastAccount='',noticedAccount='',door=null;
const focus=()=>container.querySelector('canvas[tabindex="0"]')?.focus();
let background=null;
const loadWorld=()=>import('./shell/world-loader.js');
const afterPaint=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
afterPaint.then(loadWorld).then(module=>module.loadAfterPaintModule()).then(module=>{if(disposed)return;background=module.startAfterPaint({container,adapter,send,runtime:()=>runtime,shell:()=>shell,isLoading:()=>loading});}).catch(()=>null);
// The animated pixel title (G29 C4) loads after the first paint; the painted backdrop stays underneath.
const titleScene=afterPaint.then(()=>import('./title/animated-title.js')).then(m=>m.startAnimatedTitle({container,backdrop})).catch(()=>null);
const accountHost=createLazyAccountHost({container,adapter,focus});
function openAccount(){return accountHost.open();}
async function send(name,...args){
  const result=await sendIntent(adapter,name,...args);
  if(disposed)return result;
  updateAccount(result.view);
  // The email code form shows its own answers in place (a wrong code must not open a modal).
  const inline=name==='signIn'&&args[0]?.provider==='email';
  if(!result.accepted&&!inline){await accountHost.open();accountHost.notice?.(result,()=>send(name,...args));}
  return result;
}
async function loadGame(){
  if(runtime)return runtime;if(pending)return pending;
  await ensureMotion();loading=true;const status=node('p','shell-loading','Preparing the coast…');status.setAttribute('role','status');container.append(status);
  pending=loadWorld().then(module=>module.loadGameModule()).then(module=>module.startGame({container,shell,audio,captions,adapter,openAccount,isAppBlocked:()=>accountHost.active||!!door?.active}));
  try{
    runtime=await pending;if(disposed){runtime.dispose();return null;}
    runtime.setMode(shell.mode);backdrop.hidden=shell.mode!=='title';return runtime;
  }catch(error){console.error(error);pending=null;shell.show('title');shell.notice('The coast could not load. Check the connection and WebGL 2, then try again.');return null;}
  finally{loading=false;status.remove();}
}
// Play lands the player in Saltreach Harbor (the front door's HARBOR_START, inlined for the title budget).
async function play(){
  const token=++playRequest;
  shell.play();const game=await loadGame();
  if(!disposed&&token===playRequest&&shell.mode==='playing')await game?.begin(false,{kind:'world',place:'saltreach_harbor',demo:true});
}
// Play and the intro replay load their routes only when chosen.
const routes=()=>import('./shell/routes.js'),flow={adapter,container,focus,loadGame,play,openAccount,
  claim(){const token=++playRequest;return ()=>!disposed&&token===playRequest&&shell.mode==='playing';},
  get door(){return door;},set door(value){door=value;}};
function onEscape(){
  if(door?.handleEscape())return true;
  if(accountHost.active){accountHost.close();return true;}
  if(loading){playRequest++;shell.show('title');return true;}
  return runtime?.handleEscape?.()??false;
}
shell=createShell({container,readAccount:()=>adapter.read().account,adapter,send,
  resetInput(){},focus,openAccount,onEscape,
  demo:new URLSearchParams(location.search).get('demo')==='1',settingsView:async()=>{await ensureMotion();const loader=await loadWorld();return (await loader.loadSettingsModule()).createSettingsView(adapter.read());},
  hasOverlay:()=>loading||!!door?.active||accountHost.active||!!runtime?.hasOverlay(),
  onState(mode){if(mode==='title'){playRequest++;door?.cancel();}audio.setScreen(mode);runtime?.setMode(mode);backdrop.hidden=mode!=='title'&&!!runtime;},
  onPlay:play,onStart:()=>routes().then(m=>m.start(flow)),onReplay:()=>routes().then(m=>m.start(flow,true)),
});
function updateAccount(view){
  const key=JSON.stringify(view.account);if(key===lastAccount)return;lastAccount=key;
  accountHost.update(view);
  const attention=view.account.state==='expired';
  if(!attention)noticedAccount='';
  if(attention&&noticedAccount!==key){noticedAccount=key;void accountHost.open();}
}
const stopAccount=adapter.subscribe(event=>updateAccount(event.view));updateAccount(adapter.read());
function dispose(){
  if(disposed)return;disposed=true;emit({type:'app_disposed'});background?.dispose();stopAccount();runtime?.dispose();accountHost.dispose();
  door?.dispose();shell.dispose();audio.dispose();captions.dispose();stopMotion?.();adapter.dispose();backdrop.remove();void titleScene.then(scene=>scene?.dispose());
  if(import.meta.env.DEV)delete window.__plotTwist;
}
if(import.meta.env.DEV)window.__plotTwist={adapter,shell,accountHost,dispose};
if(import.meta.hot)import.meta.hot.dispose(dispose);
