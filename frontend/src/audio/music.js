// Original eight-bar coastal motif, scheduled a note at a time with no audio files.
const melody=[62,69,74,76,74,69,67,null,65,69,72,74,72,69,62,null];
export function createMusic(context,output,synth) {
  let timer=null,mode=null,index=0;
  function tick() {
    if(!mode)return;if(context.state!=='running'){timer=setTimeout(tick,500);return;}const note=melody[index%melody.length],lift=mode==='finale'?12:0;
    if(note!==null){synth.tone(output,440*2**((note+lift-69)/12),0.27,0.065,'square');if(index%4===0)synth.tone(output,440*2**((note-24-69)/12),0.5,0.09,'triangle');}
    index++;timer=setTimeout(tick,index%16===0?1100:330);
  }
  function stop(){clearTimeout(timer);timer=null;mode=null;}
  return {set(next){if(mode===next)return;stop();mode=next;index=0;if(mode)tick();},dispose:stop};
}
