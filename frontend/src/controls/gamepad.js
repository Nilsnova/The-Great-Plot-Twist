// Optional standard-mapped gamepad. Browser keyboard controls continue to work independently.
import {gamepadVector,risingButtons} from './logic.js';
import {noteInputType} from '../diagnostics/runtime.js';
export function createGamepad(input,{menu,chart,isPlaying}) {
  let previous=[],previousId=null;
  function focusMove(direction) {
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(!dialog)return;
    const controls=[...dialog.querySelectorAll('button:not(:disabled),select,input,a[href]')].filter(node=>node.getClientRects().length);
    if(!controls.length)return;const index=controls.indexOf(document.activeElement);controls[(index+direction+controls.length)%controls.length].focus();
  }
  return {update(){
    let pads=[];try{pads=navigator.getGamepads?.()??[];}catch{/* Keyboard and touch remain available when permission is denied. */}
    const pad=pads.find(pad=>pad?.connected&&pad.mapping==='standard');
    if(!pad){previous=[];previousId=null;input.setVirtual('gamepad',{x:0,y:0});return;}
    if(previousId!==pad.id){previous=pad.buttons.map(button=>button.pressed);previousId=pad.id;}
    const buttons=pad.buttons.map(button=>button.pressed),edges=risingButtons(buttons,previous);previous=buttons;
    if(buttons.some(Boolean)||(pad.axes??[]).some(value=>Math.abs(value)>.2))noteInputType('gamepad');
    if(isPlaying()){
      const vector=gamepadVector(pad.axes);vector.x+=Number(!!buttons[15])-Number(!!buttons[14]);vector.y+=Number(!!buttons[12])-Number(!!buttons[13]);input.setVirtual('gamepad',vector);
      if(edges[0])input.press('KeyE');if(edges[3])chart();if(edges[9])menu();
    } else {
      input.setVirtual('gamepad',{x:0,y:0});if(edges[12])focusMove(-1);if(edges[13])focusMove(1);
      const target=document.activeElement,direction=edges[15]?1:edges[14]?-1:0;
      if(direction&&target instanceof HTMLSelectElement){target.selectedIndex=Math.max(0,Math.min(target.options.length-1,target.selectedIndex+direction));target.dispatchEvent(new Event('change',{bubbles:true}));}
      if(direction&&target instanceof HTMLInputElement&&target.type==='range'){target.value=String(Math.max(Number(target.min),Math.min(Number(target.max),Number(target.value)+direction*5)));target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));}
      if(edges[0]){const target=document.activeElement;if(target instanceof HTMLButtonElement||target instanceof HTMLAnchorElement||(target instanceof HTMLInputElement&&(target.type==='radio'||target.type==='checkbox')))target.click();}
      if(edges[9]||edges[1]){const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);dialog?.dispatchEvent(new Event('cancel',{cancelable:true}));}
    }
  },dispose(){input.setVirtual('gamepad',{x:0,y:0});previous=[];}};
}
