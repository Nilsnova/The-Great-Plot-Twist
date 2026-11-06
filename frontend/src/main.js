// Fast title entry. The WebGL world is fetched only after New game, Continue or the tour.
import './ui/base.css';
import './ui/kit/kit.css';
import './ui/shell.css';
import {createGamepad} from './controls/gamepad.js';
import {createShell} from './shell/controller.js';
import {createSettingsView} from './settings/view.js';
import {watchSystemMotion} from './settings/preferences.js';
import {introJournal} from './story/intro-journal.js';
import {createAudio} from './audio/controller.js';
import {createCaptions} from './audio/captions.js';
import {on} from './core/events.js';
import {node} from './ui/kit/dom.js';
const container=document.querySelector('#game'),backdrop=node('img','title-backdrop');
backdrop.src=`${import.meta.env.BASE_URL}places/title.png`;backdrop.alt='';container.append(backdrop);
const captions=createCaptions(container),audio=createAudio({container,on,caption:captions.show}),stopMotion=watchSystemMotion();
let runtime=null,pending=null,disposed=false,loading=false;
async function loadGame() {
  if(runtime)return runtime;if(pending)return pending;
  loading=true;const status=node('p','shell-loading','Preparing the coast…');status.setAttribute('role','status');container.append(status);
  pending=import('./game.js').then(module=>module.startGame({container,shell,audio,captions}));
  try {runtime=await pending;if(disposed){runtime.dispose();return null;}backdrop.hidden=true;return runtime;}
  catch(error){console.error(error);pending=null;shell.show('title');shell.notice('The coast could not load. Check the connection and WebGL 2, then try again.');return null;}
  finally{loading=false;status.remove();}
}
const shell=createShell({container,readSave:()=>introJournal().read(),resetInput(){},focus(){container.querySelector('canvas[tabindex="0"]')?.focus();},
  demo:new URLSearchParams(location.search).get('demo')==='1',settingsView:createSettingsView,hasOverlay:()=>loading||!!runtime?.hasOverlay(),
  onState(mode){audio.setScreen(mode);runtime?.setMode(mode);backdrop.hidden=mode!=='title'&&!!runtime;},
  async onPlay(resume){const game=await loadGame();await game?.begin(resume);},
  async onDemo(){const game=await loadGame();game?.startDemo();},
});
const titlePad=createGamepad({setVirtual(){},press(){}},{isPlaying:()=>false});let titleFrame;
function pollTitlePad(){if(disposed||runtime)return;if(!loading)titlePad.update();titleFrame=requestAnimationFrame(pollTitlePad);}
titleFrame=requestAnimationFrame(pollTitlePad);
function dispose(){disposed=true;cancelAnimationFrame(titleFrame);titlePad.dispose();runtime?.dispose();shell.dispose();audio.dispose();captions.dispose();stopMotion();}
if(import.meta.hot)import.meta.hot.dispose(dispose);
