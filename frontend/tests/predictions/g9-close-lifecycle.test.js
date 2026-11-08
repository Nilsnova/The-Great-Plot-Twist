// Real desk/flow/HTTP-adapter ownership with injected clients and a minimal presentation shell.
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const ui=vi.hoisted(()=>{
  class Element{
    constructor(tag,text=''){this.tagName=tag;this.value=text;this.children=[];this.open=false;this.classList={add(){}};}
    append(...items){for(const item of items){item.remove?.();this.children.push(item);if(item&&typeof item==='object')item.parent=this;}}
    replaceChildren(...items){for(const child of this.children)if(child&&typeof child==='object')child.parent=null;this.children=[];this.append(...items);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
    setAttribute(){}addEventListener(){}removeEventListener(){}focus(){}
    get firstElementChild(){return this.children.find(child=>child&&typeof child==='object')??null;}
    get textContent(){return this.value+this.children.map(child=>typeof child==='object'?child.textContent:String(child)).join('');}
    set textContent(value){this.value=String(value);this.replaceChildren();}
    querySelector(tag){return this.children.find(child=>child?.tagName===tag)??this.children.map(child=>child?.querySelector?.(tag)).find(Boolean)??null;}
  }
  const node=(tag,style,text)=>new Element(tag,text??'');
  return {Element,node,questions:[],modals:[]};
});
vi.mock('../../src/screens/predictions/dom-helpers.js',()=>({node:ui.node,button:label=>ui.node('button','',label)}));
vi.mock('../../src/ui/kit/modal.js',()=>({createModal({body,onClose}){
  const element=ui.node('dialog'),heading=ui.node('h2');element.append(heading,body);
  const modal={element,
    open(parent){if(!element.parent)parent.append(element);element.open=true;},
    close(){if(element.open){element.open=false;onClose?.('close');}},
    dispose(){if(element.open){element.open=false;onClose?.('dispose');}element.remove();},
  };ui.modals.push(modal);return modal;
}}));
vi.mock('../../src/ui/kit/tabs.js',()=>({createTabs({items}){
  const element=ui.node('div');element.append(...items.map(item=>item.body));return {element,dispose(){element.remove();}};
}}));
vi.mock('../../src/ui/kit/server-call-state.js',()=>({createServerCallState(){
  const element=ui.node('div');return {element,loading(){},fail(){},succeed(){},clear(){},dispose(){element.remove();}};
}}));
vi.mock('../../src/screens/predictions/questions-view.js',()=>({createQuestionsView(options){
  const element=ui.node('div'),view={...options,element,
    update(state){element.textContent=state.mine?'Recorded private holding':'';},cancelConfirm:()=>false,
    dispose(){element.textContent='';element.remove();},
  };ui.questions.push(view);return view;
}}));
vi.mock('../../src/screens/predictions/stakes-view.js',()=>({createStakesView(){
  const element=ui.node('div');return {element,update(){},dispose(){element.remove();}};
}}));
import {createDesk} from '../../src/screens/predictions/desk.js';

const okay=data=>({ok:true,status:200,data});
const unavailable=()=>({ok:false,status:503,code:'database_unavailable'});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function settle(){for(let step=0;step<60;step++)await Promise.resolve();}
const fixtures=[];
function setup(){
  let identity=randomUUID(),enabled=true,stakes=[],coins=100;
  const requests=[],posts=[],identityListeners=new Set(),visibilityListeners=new Set(),root=new ui.Element('div');
  const ask={questionId:randomUUID(),side:'yes',amount:20};
  const document={hidden:false,
    addEventListener(name,fn){if(name==='visibilitychange')visibilityListeners.add(fn);},
    removeEventListener(name,fn){if(name==='visibilitychange')visibilityListeners.delete(fn);},
  };
  const request={
    publicGet:vi.fn(async path=>{expect(path).toBe('/api/predictions');requests.push({method:'PUBLIC_GET',path});
      return okay({questions:[],rules:{minStake:1,maxStake:50,dailyCap:200},playMoney:'Play money.'});}),
    get:vi.fn(async path=>{expect(path).toBe('/api/predictions/mine');requests.push({method:'GET',path});
      return okay({stakes:structuredClone(stakes),coins,host:true});}),
    post:vi.fn(async(path,body)=>{
      expect(path).toBe('/api/predictions/stake');requests.push({method:'POST',path,body:structuredClone(body)});
      const reply=posts.shift();if(reply)return reply(body);
      stakes=[{questionId:body.questionId,side:body.side,amount:body.amount}];coins=80;
      return okay({...stakes[0]});
    }),
  };
  const options={container:root,request,search:'',document,getFlags:()=>({predictions:enabled}),getIdentity:()=>identity,
    onIdentityChange(listener){identityListeners.add(listener);return ()=>identityListeners.delete(listener);}};
  let desk=createDesk(options);
  const fixture={root,ask,request,requests,posts,document,identityListeners,visibilityListeners,
    get desk(){return desk;},flow:()=>ui.questions.at(-1).flow,
    async open(){await desk.open();await settle();},
    pause(kind){if(kind==='close')desk.close();else{document.hidden=true;for(const fn of visibilityListeners)fn();}},
    async resume(kind){if(kind==='close')await desk.open();else{document.hidden=false;for(const fn of visibilityListeners)fn();}await settle();},
    apply(body){stakes=[{questionId:body.questionId,side:body.side,amount:body.amount}];coins=80;},
    async boundary(kind){
      if(kind==='identity'){identity=randomUUID();stakes=[];coins=100;for(const fn of identityListeners)fn({signedIn:true});}
      if(kind==='flag'){enabled=false;await desk.refresh();enabled=true;}
      if(kind==='dispose'){desk.dispose();desk=createDesk(options);}
      await settle();
    },
    close(){desk.dispose();},
  };fixtures.push(fixture);return fixture;
}
beforeEach(()=>{vi.useFakeTimers();ui.questions.length=0;ui.modals.length=0;});
afterEach(()=>{for(const f of fixtures.splice(0)){f.close();expect(f.identityListeners.size).toBe(0);expect(f.visibilityListeners.size).toBe(0);}
  expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});

describe('prediction same-account close and hide ownership',()=>{
  it.each(['close','hide'])('keeps a held stake UID across ordinary %s and reads before explicit repeat',async kind=>{
    const f=setup();await f.open();const held=deferred();f.posts.push(()=>held.promise);
    const first=f.flow().stake(f.ask);await settle();
    expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);
    const body=f.requests.find(r=>r.method==='POST').body;
    f.pause(kind);expect(f.root.textContent).not.toContain('Recorded private holding');
    held.resolve(unavailable());expect(await first).toMatchObject({cancelled:true});
    await f.resume(kind);expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);
    const start=f.requests.length;expect((await f.flow().stake(f.ask)).done).toBe(true);
    const repeated=f.requests.slice(start);expect(repeated.map(r=>r.method)).toEqual(['GET','POST']);
    expect(repeated[1].body).toEqual(body);
    expect(Object.keys(body).sort()).toEqual(['amount','questionId','side','stakeId']);
  });

  it('does not repeat an applied held stake after reopening and confirming the immutable holding',async()=>{
    const f=setup();await f.open();const held=deferred();f.posts.push(body=>{f.apply(body);return held.promise;});
    const first=f.flow().stake(f.ask);await settle();f.desk.close();
    held.resolve(unavailable());expect((await first).cancelled).toBe(true);await f.open();
    const start=f.requests.length;expect(await f.flow().stake(f.ask)).toMatchObject({done:true,reply:{kind:'done'}});
    expect(f.requests.slice(start).map(r=>r.method)).toEqual(['GET']);
    expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);
    expect((await f.flow().settle({questionId:f.ask.questionId,outcome:'yes'})).cancelled).toBe(true);
    expect(f.requests.some(r=>r.path.endsWith('/settle'))).toBe(false);
  });

  it('fences a late old response after a reopened explicit same-UID repeat succeeds',async()=>{
    const f=setup();await f.open();const held=deferred();f.posts.push(()=>held.promise);
    const first=f.flow().stake(f.ask);await settle();f.desk.close();await f.open();
    expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);
    expect((await f.flow().stake(f.ask)).done).toBe(true);
    held.resolve(unavailable());expect((await first).cancelled).toBe(true);
    const writes=f.requests.filter(r=>r.method==='POST');expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    const start=f.requests.length;await f.desk.refresh();
    expect(f.requests.slice(start).some(r=>r.method==='POST')).toBe(false);
  });

  it.each(['identity','flag','dispose'])('erases held attempts on %s teardown and fences their late receipt',async kind=>{
    const f=setup();await f.open();const oldFlow=f.flow(),held=deferred();f.posts.push(()=>held.promise);
    const first=oldFlow.stake(f.ask);await settle();const oldBody=f.requests.find(r=>r.method==='POST').body;
    await f.boundary(kind);held.resolve(unavailable());expect((await first).cancelled).toBe(true);
    await f.open();expect((await f.flow().stake(f.ask)).done).toBe(true);
    const writes=f.requests.filter(r=>r.method==='POST');expect(writes).toHaveLength(2);
    expect(writes[1].body.stakeId).not.toBe(oldBody.stakeId);
    const start=f.requests.length;expect((await oldFlow.stake(f.ask)).cancelled).toBe(true);
    expect(f.requests).toHaveLength(start);
  });
});
