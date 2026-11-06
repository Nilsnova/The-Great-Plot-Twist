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
// Button A presses a focused control inside a dialog. The Exchange panel needs it for its radio groups (side and stake).
describe('gamepad button A in a dialog',()=>{
  class Button {click=vi.fn();}
  class Anchor {click=vi.fn();}
  class Input {constructor(type){this.type=type;this.click=vi.fn();}}
  class Select {}
  function press(focused){
    const pad={connected:true,mapping:'standard',id:'test pad',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
    vi.stubGlobal('navigator',{getGamepads:()=>[pad]});
    vi.stubGlobal('document',{activeElement:focused,querySelectorAll:()=>[]});
    vi.stubGlobal('HTMLButtonElement',Button);vi.stubGlobal('HTMLAnchorElement',Anchor);vi.stubGlobal('HTMLInputElement',Input);vi.stubGlobal('HTMLSelectElement',Select);
    const gamepad=createGamepad({setVirtual:vi.fn(),press:vi.fn()},{menu:vi.fn(),chart:vi.fn(),isPlaying:()=>false});
    gamepad.update(); // the first look only learns which buttons are down
    pad.buttons[0].pressed=true;gamepad.update();
  }
  it('clicks a focused button and a focused link',()=>{
    const button=new Button(),link=new Anchor();
    press(button);press(link);
    expect(button.click).toHaveBeenCalledTimes(1);expect(link.click).toHaveBeenCalledTimes(1);
  });
  it('chooses a focused radio button and ticks a focused checkbox',()=>{
    const radio=new Input('radio'),box=new Input('checkbox');
    press(radio);press(box);
    expect(radio.click).toHaveBeenCalledTimes(1);expect(box.click).toHaveBeenCalledTimes(1);
  });
  it('leaves other inputs alone',()=>{
    const text=new Input('text'),range=new Input('range');
    press(text);press(range);
    expect(text.click).not.toHaveBeenCalled();expect(range.click).not.toHaveBeenCalled();
  });
});
