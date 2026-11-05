// Gesture-gated Web Audio owner. Uses current weather and semantic UI/world cues only.
import {getPreferences,onPreferences} from '../settings/preferences.js';
import {mixVolumes,strideStep} from './logic.js';
import {createSynth} from './synth.js';
import {createAmbience} from './ambience.js';
import {createMusic} from './music.js';
export function createAudio({container,on,caption}) {
  let context,master,musicBus,effectsBus,synth,ambience,music,disposed=false,screen='title',finale=false,stride=0,hornAt=0,beamAt=0,lastBlip=0;
  function apply(){if(!context)return;const p=getPreferences(),mix=mixVolumes(p),now=context.currentTime;for(const [bus,value] of [[master,mix.master],[musicBus,p.music],[effectsBus,p.effects]]){bus.gain.cancelScheduledValues(now);if(value===0)bus.gain.setValueAtTime(0,now);else bus.gain.setTargetAtTime(value,now,0.03);}}
  function theme(){music?.set(document.hidden?null:finale?'finale':screen==='title'?'title':null);}
  function unlock(event) {
    if(disposed||!event.isTrusted)return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!context){context=new Audio();master=context.createGain();musicBus=context.createGain();effectsBus=context.createGain();master.gain.value=0;musicBus.connect(master);effectsBus.connect(master);master.connect(context.destination);synth=createSynth(context);ambience=createAmbience(context,effectsBus);music=createMusic(context,musicBus,synth);apply();}
    context.resume().then(()=>{if(!disposed)theme();}).catch(()=>caption('Sound unavailable. All cues remain visible.'));
  }
  function cue(name) {
    if(!context||context.state!=='running'||disposed)return;
    if(name==='foghorn'){synth.tone(effectsBus,98,1.6,0.16,'sine');synth.tone(effectsBus,147,1.4,0.07,'sine');caption('Lighthouse foghorn · a low call across the water');}
    if(name==='beam'){synth.tone(effectsBus,587,0.7,0.035,'sine');caption('The lighthouse beam sweeps across the coast');}
    if(name==='step')synth.tone(effectsBus,105,0.035,0.035,'triangle');
    if(name==='click')synth.tone(effectsBus,440,0.055,0.035,'triangle');
    if(name==='blip'&&performance.now()-lastBlip>85){lastBlip=performance.now();synth.tone(effectsBus,660,0.025,0.015,'triangle');}
  }
  const click=event=>{if(event.target.closest('button'))cue('click');},blip=()=>cue('blip');
  const visibility=()=>{theme();if(document.hidden)context?.suspend().catch(()=>{});};
  window.addEventListener('click',unlock,true);window.addEventListener('pointerdown',unlock,true);window.addEventListener('keydown',unlock,true);document.addEventListener('click',click,true);document.addEventListener('dialogue-blip',blip);document.addEventListener('visibilitychange',visibility);
  const stopPreferences=onPreferences(apply),stopCinematic=on('cinematic',event=>{finale=event.stage==='started';if(finale)cue('beam');theme();});
  return {get state(){return context?.state??'locked';},cue,
    setScreen(mode){screen=mode;theme();},
    update(dt,{weather,speed=0,night=0,active=false,place}={}) {
      if(!context||disposed)return;ambience.update(weather,screen==='playing'&&active);
      const step=strideStep(stride,active?speed:0,dt);stride=step.distance;if(step.step)cue('step');
      if(active&&place==='lighthouse_isle'){
        hornAt+=dt;beamAt+=dt;
        if(weather.fog>0.65&&hornAt>22){hornAt=0;cue('foghorn');}
        if(night>0.3&&beamAt>35){beamAt=0;cue('beam');}
      }
    },
    dispose(){if(disposed)return;disposed=true;window.removeEventListener('click',unlock,true);window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',unlock,true);document.removeEventListener('click',click,true);document.removeEventListener('dialogue-blip',blip);document.removeEventListener('visibilitychange',visibility);stopPreferences();stopCinematic();music?.dispose();ambience?.dispose();synth?.dispose();master?.disconnect();musicBus?.disconnect();effectsBus?.disconnect();context?.close().catch(()=>{});},
  };
}
