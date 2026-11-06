// Short original oscillator voices. Every source is tracked for immediate app cleanup.
export function createSynth(context) {
  const voices=new Map();
  function track(source,nodes) {
    voices.set(source,nodes);
    source.onended=()=>{voices.delete(source);source.disconnect();for(const node of nodes)node.disconnect();};
  }
  function tone(output,frequency,duration=0.1,volume=0.06,type='triangle',delay=0) {
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    oscillator.connect(gain);gain.connect(output);track(oscillator,[gain]);
    oscillator.start(start);oscillator.stop(start+duration+0.02);
  }
  function noise(output,duration=0.12,volume=0.02,frequency=1500) {
    const frames=Math.max(1,Math.ceil(context.sampleRate*duration)),buffer=context.createBuffer(1,frames,context.sampleRate),data=buffer.getChannelData(0);
    let seed=32452843;for(let i=0;i<frames;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),start=context.currentTime;
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter);filter.connect(gain);gain.connect(output);track(source,[filter,gain]);source.start(start);source.stop(start+duration+.02);
  }
  return {tone,noise,dispose(){for(const [voice,nodes] of voices){voice.onended=null;try{voice.stop();}catch{/* Already ended. */}voice.disconnect();for(const node of nodes)node.disconnect();}voices.clear();}};
}
