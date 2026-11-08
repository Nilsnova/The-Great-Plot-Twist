// The real lazy controller and hints use inert native-like controls; no browser or network.
import {afterEach,expect,it,vi} from 'vitest';
const ui=vi.hoisted(()=>{
  class Element{
    constructor(tag,text=''){this.tagName=tag;this.value=String(text);this.children=[];this.dataset={};this.events={};this.classList={add(){}};}
    append(...children){for(const child of children){child.remove?.();child.parent=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this.append(...children);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
    setAttribute(){}focus(){}contains(){return false;}
    addEventListener(name,callback){this.events[name]=callback;}
    removeEventListener(name,callback){if(this.events[name]===callback)delete this.events[name];}
    click(){this.events.click?.();}
    querySelector(tag){return this.children.find(child=>child.tagName===tag)??this.children.map(child=>child.querySelector(tag)).find(Boolean)??null;}
    get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
    set textContent(value){this.value=String(value);this.replaceChildren();}
  }
  const node=(tag,_class,text)=>new Element(tag,text??''),component=()=>({element:node('section'),update(){},dispose(){}});
  return {node,component,preferences:{hintsEnabled:true,dismissedHints:[]},save:vi.fn()};
});
vi.mock('../src/ui/kit/dom.js',()=>({node:ui.node}));
vi.mock('../src/screens/helpers.js',()=>({node:ui.node,button:label=>ui.node('button','',label)}));
vi.mock('../src/settings/preferences.js',()=>({getPreferences:()=>ui.preferences,setPreferences:ui.save}));
vi.mock('../src/ui/kit/modal.js',()=>({createModal({body}){
  const element=ui.node('dialog');element.append(ui.node('h2'),body);
  return {element,setTitle(){},open(parent){parent.append(element);},close(){},dispose(){element.remove();}};
}}));
vi.mock('../src/ui/kit/server-call-state.js',()=>({createServerCallState:()=>({element:ui.node('div'),read:()=>({remaining:0}),
  setSignInAllowed(){},showMessage(){},clear(){},dispose(){}})}));
vi.mock('../src/ui/kit/intent-cooldown.js',()=>({syncIntentCooldown(){}}));
vi.mock('../src/ui/connection-banner.js',()=>({createConnectionBanner:ui.component}));
vi.mock('../src/screens/arrival.js',()=>({createArrivalScreen:ui.component}));
vi.mock('../src/screens/crew.js',()=>({createCrewScreen:ui.component}));
import {createCaseScreens} from '../src/screens/controller.js';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

it('reads completion when What next opens and routes its kit action without dispatching on display',async()=>{
  vi.stubGlobal('document',{activeElement:null,addEventListener(){},removeEventListener(){}});
  const container=ui.node('div'),onboardingAction=vi.fn(),dispatch=vi.fn();let complete=false;
  const view={mode:'online',revision:1,account:{state:'signed_in',hasKit:false},arrival:{status:'pending'},
    crew:{status:'none'},hints:{items:[],actions:[]},notice:{message:''}};
  const screens=createCaseScreens({container,adapter:{read:()=>view,subscribe:()=>()=>{},completeIntro:dispatch},
    onboardingAction,readIntroComplete:()=>complete});
  const findButton=(node,label)=>node.tagName==='button'&&node.textContent===label?node
    :node.children.map(child=>findButton(child,label)).find(Boolean);
  try{
    await screens.open('hints');expect(findButton(container,'Open arrival')).toBeUndefined();
    expect(onboardingAction).not.toHaveBeenCalled();expect(dispatch).not.toHaveBeenCalled();
    complete=true;await screens.open('hints');
    const action=findButton(container,'Open arrival');expect(action).toBeDefined();action.click();
    expect(onboardingAction).toHaveBeenCalledExactlyOnceWith('arrival');
    expect(ui.save).toHaveBeenCalledExactlyOnceWith({hintsEnabled:true,dismissedHints:['onboarding-kit']});
    expect(findButton(container,'Open arrival')).toBeUndefined();expect(dispatch).not.toHaveBeenCalled();
  }finally{screens.dispose();}
});
