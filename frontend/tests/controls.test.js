// Touch and gamepad vectors map into existing keyboard movement without diagonal acceleration.
import {describe,it,expect} from 'vitest';
import {touchVector,gamepadVector,combinedAxis,risingButtons} from '../src/controls/logic.js';
describe('device controls',()=>{
  it('maps drag up to forward, right to right and clamps outside the stick',()=>{
    expect(touchVector(44,0)).toEqual({x:1,y:-0});expect(touchVector(0,-88)).toEqual({x:0,y:1});
    const diagonal=touchVector(80,-80);expect(Math.hypot(diagonal.x,diagonal.y)).toBeCloseTo(1);
  });
  it('ignores deadzones, bad values and disconnected pads',()=>{
    expect(touchVector(2,1)).toEqual({x:0,y:0});expect(touchVector(NaN,0)).toEqual({x:0,y:0});expect(gamepadVector()).toEqual({x:0,y:0});
  });
  it('combines sources without exceeding one axis and debounces actions',()=>{
    expect(combinedAxis(1,[{x:0.8}],'x')).toBe(1);expect(combinedAxis(1,[{x:-1}],'x')).toBe(0);
    expect(risingButtons([true,true,false],[true,false,true])).toEqual([false,true,false]);
  });
});
