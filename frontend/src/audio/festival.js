// Original WAV playback through the game's existing gesture-gated music/effects buses.
import {festivalSounds} from './festival-catalog.js';
export function createFestivalSound(context,musicBus,effectsBus,caption,{fetchImpl=globalThis.fetch}={}) {
  const buffers=new Map(),sources=new Set();let disposed=false,loop=null,wanted=false,generation=0;
  async function play(id,repeating=false,epoch=generation){
    const sound=festivalSounds.find(item=>item.id===id);
    if(!sound||disposed||context.state!=='running')return false;
    try {
      if(!buffers.has(id))buffers.set(id,fetchImpl(`${import.meta.env.BASE_URL}${sound.file}`).then(response=>{if(!response.ok)throw new Error('audio');return response.arrayBuffer();}).then(bytes=>context.decodeAudioData(bytes)).catch(error=>{buffers.delete(id);throw error;}));
      const buffer=await buffers.get(id);
      if(disposed||context.state!=='running'||(repeating&&(!wanted||epoch!==generation)))return false;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=repeating;
      gain.gain.value=repeating ? 0.25 : 0.45;source.connect(gain);gain.connect(repeating?musicBus:effectsBus);
      source.onended=()=>{if(loop===source)loop=null;sources.delete(source);source.disconnect();gain.disconnect();};sources.add(source);
      if(!repeating){const effects=[...sources].filter(item=>item!==loop);if(effects.length>4)effects[0].stop();}
      source.start();if(repeating)loop=source;else caption(sound.caption);return true;
    }catch{if(!disposed)caption('Festival sound unavailable. Every update remains visible.');return false;}
  }
  return {cue:id=>play(id),setActive(active){if(wanted===active&&(!active||loop))return;wanted=active;generation++;if(loop){loop.stop();loop=null;}if(wanted)void play('loop',true,generation);},dispose(){disposed=true;wanted=false;generation++;for(const source of sources){try{source.stop();}catch{/* Already ended. */}}sources.clear();buffers.clear();}};
}
