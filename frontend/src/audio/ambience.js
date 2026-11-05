// Two seconds of deterministic procedural noise, filtered into sea, wind and rain.
import {weatherSound} from './logic.js';
export function createAmbience(context,output) {
  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
  let seed=37;for(let i=0;i<samples.length;i++){seed=(seed*16807)%2147483647;samples[i]=seed/1073741823.5-1;}
  const layers=['sea','wind','rain'].map((name,index)=>{
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;source.loop=true;filter.type=index===2?'highpass':'lowpass';filter.frequency.value=[500,1000,2300][index];gain.gain.value=0;
    source.connect(filter);filter.connect(gain);gain.connect(output);source.start();return {name,source,filter,gain};
  });
  return {update(weather,active=true){const levels=weatherSound(weather);for(const layer of layers){layer.gain.gain.setTargetAtTime(active?levels[layer.name]:0,context.currentTime,0.5);if(layer.name==='wind')layer.filter.frequency.setTargetAtTime(levels.cutoff,context.currentTime,0.5);}},
    dispose(){for(const layer of layers){layer.source.stop();layer.source.disconnect();layer.filter.disconnect();layer.gain.disconnect();}}};
}
