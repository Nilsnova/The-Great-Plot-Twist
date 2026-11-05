// Optional Gamepad API failure must never stop keyboard/touch frames. No DOM is needed.
import {describe,it,expect,vi,afterEach} from 'vitest';
import {createGamepad} from '../src/controls/gamepad.js';
afterEach(()=>vi.unstubAllGlobals());
describe('optional gamepad availability',()=>{
  it.each([{}, {getGamepads(){throw new Error('Gamepad permission denied');}}, {getGamepads:()=>[]}])('releases pad movement when unavailable',navigator=>{
    vi.stubGlobal('navigator',navigator);const setVirtual=vi.fn(),pad=createGamepad({setVirtual},{isPlaying:()=>true});
    expect(()=>pad.update()).not.toThrow();expect(setVirtual).toHaveBeenCalledWith('gamepad',{x:0,y:0});pad.dispose();
  });
});
