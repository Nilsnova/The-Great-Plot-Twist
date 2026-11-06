// Fast title entry. One adapter is shared by title, account and the lazily loaded world.
import './ui/styles.css';
import './ui/kit/kit.css';
import './ui/shell.css';
import {createShell} from './shell/controller.js';
import {createLazyAccountHost} from './shell/lazy-account.js';
import {createAccountSummary} from './screens/account/summary.js';
import {createClientAdapter} from './adapter/select.js';
async function sendCaseIntent(...args){return (await import('./adapter/intent.js')).sendCaseIntent(...args);}
import {introJournal} from './story/intro-journal.js';
import {createLazyAudio} from './audio/lazy.js';
import {createCaptions} from './audio/captions.js';
import {on,emit} from './core/events.js';
import {node} from './ui/kit/dom.js';

const container=document.querySelector('#game'),backdrop=node('img','title-backdrop');
backdrop.src=`${import.meta.env.BASE_URL}places/title.png`;backdrop.alt='';container.append(backdrop);
const captions=createCaptions(container),audio=createLazyAudio({container,on,caption:captions.show});
let stopMotion=null;
const adapter=await createClientAdapter();
async function ensureMotion(){if(!stopMotion)stopMotion=(await import('./settings/preferences.js')).watchSystemMotion();}
let runtime=null,pending=null,disposed=false,loading=false,playRequest=0,shell,lastAccount='',noticedAccount='';
const focus=()=>container.querySelector('canvas[tabindex="0"]')?.focus();
const accountHost=createLazyAccountHost({container,adapter,focus,onContinue:result=>play(true,result)});
async function send(name,...args){
  const result=await sendCaseIntent(adapter,name,...args);
  updateAccount(result.view);
  if(!result.accepted){await accountHost.open();accountHost.notice?.(result,()=>send(name,...args));}
  return result;
}
const summary=createAccountSummary({send,openAccount:()=>accountHost.open()});
summary.update(adapter.read());
async function loadGame(){
  if(runtime)return runtime;if(pending)return pending;
  await ensureMotion();loading=true;const status=node('p','shell-loading','Preparing the coast…');status.setAttribute('role','status');container.append(status);
  pending=import('./game.js').then(module=>module.startGame({container,shell,audio,captions,caseAdapter:adapter,isAppBlocked:()=>accountHost.active}));
  try{
    runtime=await pending;if(disposed){runtime.dispose();return null;}
    runtime.setMode(shell.mode);backdrop.hidden=shell.mode!=='title';return runtime;
  }catch(error){console.error(error);pending=null;shell.show('title');shell.notice('The coast could not load. Check the connection and WebGL 2, then try again.');return null;}
  finally{loading=false;status.remove();}
}
async function play(resume,ready){
  const token=++playRequest;
  const result=resume?(ready??await sendCaseIntent(adapter,'continueGame')):null;
  if(result&&!result.accepted){await accountHost.open();accountHost.notice?.(result,()=>play(true));return;}
  const continuation=result?.view?.continuation;
  if(continuation?.source==='cloud'&&Array.isArray(continuation.actions))introJournal().write(JSON.stringify({version:1,actions:continuation.actions}));
  shell.play();const game=await loadGame();
  if(!disposed&&token===playRequest&&shell.mode==='playing')await game?.begin(resume,continuation);
}
function onEscape(){
  if(accountHost.active){accountHost.close();return true;}
  if(loading){playRequest++;shell.show('title');return true;}
  return runtime?.handleEscape?.()??false;
}
shell=createShell({container,readSave:()=>introJournal().read(),readAccount:()=>adapter.read().account,accountSummary:summary.element,
  resetInput(){},focus,openAccount:()=>accountHost.open(),onEscape,
  demo:new URLSearchParams(location.search).get('demo')==='1',settingsView:async()=>{await ensureMotion();return (await import('./settings/view.js')).createSettingsView();},
  hasOverlay:()=>loading||accountHost.active||!!runtime?.hasOverlay(),
  onState(mode){if(mode==='title')playRequest++;audio.setScreen(mode);runtime?.setMode(mode);backdrop.hidden=mode!=='title'&&!!runtime;},
  onPlay:play,async onDemo(){const game=await loadGame();game?.startDemo();},
});
function updateAccount(view){
  const key=JSON.stringify(view.account);if(key===lastAccount)return;lastAccount=key;
  summary.update(view);accountHost.update(view);shell?.setAccount(view.account);
  const attention=view.account.state==='expired'||view.account.save.state==='conflict';
  if(!attention)noticedAccount='';
  if(attention&&noticedAccount!==key){noticedAccount=key;void accountHost.open();}
}
const stopAccount=adapter.subscribe(event=>updateAccount(event.view));updateAccount(adapter.read());
let titlePad=null,padLoading=false,titleFrame,previous=performance.now();
function preparePad(){if(titlePad||padLoading)return;let connected=false;try{connected=[...(navigator.getGamepads?.()??[])].some(pad=>pad?.connected);}catch{}if(!connected)return;padLoading=true;import('./controls/gamepad.js').then(({createGamepad})=>{if(!disposed)titlePad=createGamepad({setVirtual(){},press(){}},{isPlaying:()=>false});}).finally(()=>{padLoading=false;});}
function pollTitlePad(now){
  if(disposed||runtime)return;
  if(!loading){preparePad();titlePad?.update();adapter.tick?.(Math.min(.1,(now-previous)/1000));}
  previous=now;titleFrame=requestAnimationFrame(pollTitlePad);
}
titleFrame=requestAnimationFrame(pollTitlePad);
function dispose(){
  if(disposed)return;disposed=true;emit({type:'app_disposed'});cancelAnimationFrame(titleFrame);titlePad?.dispose();stopAccount();runtime?.dispose();accountHost.dispose();summary.dispose();
  shell.dispose();audio.dispose();captions.dispose();stopMotion?.();adapter.dispose();backdrop.remove();
  if(import.meta.env.DEV)delete window.__plotTwist;
}
if(import.meta.env.DEV)window.__plotTwist={adapter,shell,accountHost,dispose};
if(import.meta.hot)import.meta.hot.dispose(dispose);
