// Recorded festival sound obeys the shared context gate and cancels late playback on close.
import {describe,it,expect,vi} from 'vitest';
import {createFestivalSound} from '../../src/audio/festival.js';
function setup(state='running',decode=async()=>({duration:8})){
 const sources=[],context={state,decodeAudioData:decode,createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource(){const source={loop:false,connect(){},disconnect(){},start:vi.fn(),stop:vi.fn(()=>source.onended?.())};sources.push(source);return source;}};
 const fetchImpl=vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})),caption=vi.fn();
 return {context,sources,fetchImpl,caption,sound:createFestivalSound(context,{}, {},caption,{fetchImpl})};
}
const flush=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};
describe('festival recordings',()=>{
 it('does not fetch or play while the gesture-owned context is suspended',async()=>{const{sound,fetchImpl}=setup('suspended');expect(await sound.cue('claim')).toBe(false);sound.setActive(true);expect(fetchImpl).not.toHaveBeenCalled();sound.dispose();});
 it('can start after the user resumes a previously suspended context',async()=>{const{sound,context,sources}=setup('suspended');sound.setActive(true);context.state='running';sound.setActive(true);await flush();expect(sources).toHaveLength(1);expect(sources[0].loop).toBe(true);expect(sources[0].start).toHaveBeenCalledOnce();sound.dispose();expect(sources[0].stop).toHaveBeenCalledOnce();});
 it('does not start a recording that finishes decoding after the panel closed',async()=>{let finish;const{sound,sources}=setup('running',()=>new Promise(resolve=>finish=resolve));sound.setActive(true);await flush();sound.setActive(false);finish({duration:8});await flush();expect(sources).toHaveLength(0);sound.dispose();});
 it('uses only known original files, caches buffers and supplies captions',async()=>{const{sound,fetchImpl,caption}=setup();expect(await sound.cue('unknown')).toBe(false);await sound.cue('claim');await sound.cue('claim');expect(fetchImpl).toHaveBeenCalledTimes(1);expect(fetchImpl.mock.calls[0][0]).toMatch(/audio\/festival-claim.wav$/);expect(caption).toHaveBeenCalledTimes(2);sound.dispose();expect(await sound.cue('claim')).toBe(false);});
});

describe('festival music survives burst confirmations',()=>{
 it('bounds confirmation cues without evicting the looping music',async()=>{const{sound,sources}=setup();sound.setActive(true);await flush();const loop=sources.find(source=>source.loop);for(let index=0;index<5;index++)await sound.cue('claim');expect(loop.stop).not.toHaveBeenCalled();expect(sources.filter(source=>!source.loop).some(source=>source.stop.mock.calls.length)).toBe(true);sound.dispose();expect(loop.stop).toHaveBeenCalledOnce();});
});
