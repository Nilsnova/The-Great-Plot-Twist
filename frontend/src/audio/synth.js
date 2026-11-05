// Short original oscillator voices. Every source is tracked for immediate app cleanup.
export function createSynth(context) {
  const voices=new Map();
  function tone(output,frequency,duration=0.1,volume=0.06,type='triangle',delay=0) {
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    oscillator.connect(gain);gain.connect(output);voices.set(oscillator,gain);
    oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    oscillator.start(start);oscillator.stop(start+duration+0.02);
  }
  return {tone,dispose(){for(const [voice,gain] of voices){voice.onended=null;try{voice.stop();}catch{/* Already ended. */}voice.disconnect();gain.disconnect();}voices.clear();}};
}
