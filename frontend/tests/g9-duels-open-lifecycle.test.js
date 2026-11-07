// Actual entry and panel lifetimes, with inert kit controls and injected adapters only.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const fakes=vi.hoisted(()=>{
  const node=()=>({open:false,hidden:false,classList:{add:vi.fn()},append:vi.fn(),replaceChildren:vi.fn(),
    setAttribute:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),focus:vi.fn()});
  return {node,choose:vi.fn(),modals:[],reveals:[]};
});
vi.mock('../src/screens/duels/http-adapter.js',()=>({createHttpAdapter:fakes.choose}));
vi.mock('../src/screens/duels/dom.js',()=>({node:fakes.node,whenRemoved:()=>()=>{}}));
vi.mock('../src/ui/kit/modal.js',()=>({createModal:options=>{
  const element=fakes.node(),heading=fakes.node();element.querySelector=()=>heading;fakes.modals.push(element);
  return {element,open(_parent,target){element.open=true;target?.focus();},
    close(){if(element.open){element.open=false;options.onClose?.('close');}},
    dispose(){if(element.open){element.open=false;options.onClose?.('dispose');}}};
}}));
vi.mock('../src/ui/kit/tabs.js',()=>({createTabs:options=>({element:fakes.node(),
  select(index){const item=options.items[index];options.onChange?.(item.id,index);},dispose(){}})}));
vi.mock('../src/screens/duels/panel-status.js',()=>({isReady:view=>view.mode==='ready',createStatus:()=>({
  elements:[],blocked:()=>false,say:vi.fn(),update:vi.fn(),dispose:vi.fn(),
})}));
vi.mock('../src/screens/duels/challenges.js',()=>({createChallenges:()=>({element:fakes.node(),update(){},dispose(){}})}));
vi.mock('../src/screens/duels/new-challenge.js',()=>({createNewChallenge:()=>({element:fakes.node(),update(){},prefill(){},dispose(){}})}));
vi.mock('../src/screens/duels/history.js',()=>({createHistory:()=>({element:fakes.node(),update(){},dispose(){}})}));
vi.mock('../src/screens/duels/rules-card.js',()=>({createRulesCard:()=>({element:fakes.node(),update(){},dispose(){}})}));
vi.mock('../src/screens/duels/reveal.js',()=>({createReveal:()=>({element:fakes.node(),active:false,
  play(duel){fakes.reveals.push(duel.id);},leave(){},dispose(){}})}));
import {closeArena,disposeArena,isArenaOpen,openArena} from '../src/screens/duels/index.js';

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const detail=id=>({ok:true,view:{selected:{id,status:'finished',reveal:[]}}});
function adapter(){return {read:()=>({mode:'ready',yours:[],notice:null,selected:null}),subscribe:()=>()=>{},
  setVisible:vi.fn(async()=>{}),refresh:vi.fn(async()=>({ok:true})),
  select:vi.fn(async id=>detail(id)),dispose:vi.fn(),retry:vi.fn(),challenge:vi.fn(),answer:vi.fn(),cancel:vi.fn()};}
const ctx=extra=>({container:{},resetInput:vi.fn(),focus:vi.fn(),getFlags:()=>({arena:true}),
  request:{get(){},post(){},publicGet(){}},getIdentity:()=>1,onIdentityChange:()=>()=>{},...extra});
let listeners;
beforeEach(()=>{
  disposeArena();vi.clearAllMocks();fakes.modals.length=0;fakes.reveals.length=0;listeners=new Map();
  vi.stubGlobal('location',{search:''});
  vi.stubGlobal('document',{hidden:false,addEventListener:(name,listener)=>listeners.set(name,listener),
    removeEventListener:(name,listener)=>{if(listeners.get(name)===listener)listeners.delete(name);}});
});
afterEach(()=>{disposeArena();vi.unstubAllGlobals();});

it('exports ordinary close and reuses the same adapter after reopening',async()=>{
  const api=adapter();fakes.choose.mockReturnValue(api);const context=ctx();await openArena(context);
  expect(isArenaOpen()).toBe(true);closeArena();expect(isArenaOpen()).toBe(false);
  expect(api.dispose).not.toHaveBeenCalled();expect(api.setVisible).toHaveBeenLastCalledWith(false);
  await openArena(context);expect(isArenaOpen()).toBe(true);expect(fakes.choose).toHaveBeenCalledOnce();
  expect(fakes.modals).toHaveLength(1);expect(api.dispose).not.toHaveBeenCalled();
});

it('cancels a deferred opening on ordinary close and permits a later fresh opening',async()=>{
  const held=deferred(),old=adapter(),next=adapter();fakes.choose.mockReturnValueOnce(held.promise);
  const opening=openArena(ctx());closeArena();fakes.choose.mockReturnValueOnce(next);await openArena(ctx());
  held.resolve(old);await opening;
  expect(old.dispose).toHaveBeenCalledOnce();expect(next.dispose).not.toHaveBeenCalled();
  expect(fakes.modals).toHaveLength(1);expect(isArenaOpen()).toBe(true);
});

it('uses only the latest requested duel when two opens share a deferred adapter',async()=>{
  const held=deferred(),api=adapter();fakes.choose.mockReturnValueOnce(held.promise);
  const context=ctx(),older=openArena({...context,duelId:'recorded-old'}),newer=openArena({...context,duelId:'recorded-new'});
  held.resolve(api);await Promise.all([older,newer]);
  expect(fakes.choose).toHaveBeenCalledOnce();expect(fakes.modals).toHaveLength(1);
  expect(api.select).toHaveBeenCalledExactlyOnceWith('recorded-new');expect(fakes.reveals).toEqual(['recorded-new']);
});

it('does not share an arena between distinct capability owners with equal numeric scopes',async()=>{
  const first=adapter(),second=adapter();fakes.choose.mockReturnValueOnce(first).mockReturnValueOnce(second);
  const older=ctx(),newer=ctx();expect(older.getIdentity()).toBe(newer.getIdentity());
  await openArena(older);await openArena({...newer,duelId:'recorded-second-owner'});
  expect(first.dispose).toHaveBeenCalledOnce();expect(second.dispose).not.toHaveBeenCalled();
  expect(fakes.choose).toHaveBeenCalledTimes(2);expect(fakes.modals).toHaveLength(2);
  expect(first.select).not.toHaveBeenCalled();expect(second.select).toHaveBeenCalledExactlyOnceWith('recorded-second-owner');
  expect(isArenaOpen()).toBe(true);
});

it('honors a newer duel id while already open and fences the older held detail',async()=>{
  const api=adapter(),held=deferred(),started=deferred(),context=ctx();fakes.choose.mockReturnValue(api);await openArena(context);
  api.select.mockImplementationOnce(()=>{started.resolve();return held.promise;});
  const older=openArena({...context,duelId:'recorded-old'});await started.promise;
  await openArena({...context,duelId:'recorded-new'});held.resolve(detail('recorded-old'));await older;
  expect(api.select.mock.calls.map(([id])=>id)).toEqual(['recorded-old','recorded-new']);
  expect(fakes.reveals).toEqual(['recorded-new']);
});

it.each(['identity','flag'])('does not create a panel after %s changes during adapter selection',async boundary=>{
  const held=deferred(),api=adapter();let identity=1,enabled=true;
  fakes.choose.mockReturnValueOnce(held.promise);
  const opening=openArena(ctx({getIdentity:()=>identity,getFlags:()=>({arena:enabled})}));
  if(boundary==='identity')identity=2;else enabled=false;
  held.resolve(api);await opening;
  expect(api.dispose).toHaveBeenCalledOnce();expect(fakes.modals).toHaveLength(0);expect(isArenaOpen()).toBe(false);
});

it('cancels a held refresh before its duel detail can open after ordinary close',async()=>{
  const api=adapter(),held=deferred(),started=deferred(),context=ctx();fakes.choose.mockReturnValue(api);await openArena(context);
  api.refresh.mockImplementationOnce(()=>{started.resolve();return held.promise;});
  const opening=openArena({...context,duelId:'recorded-old'});await started.promise;closeArena();held.resolve({ok:true});await opening;
  expect(api.select).not.toHaveBeenCalled();expect(fakes.reveals).toEqual([]);expect(isArenaOpen()).toBe(false);
});

it('ignores a held reveal result after the document becomes hidden',async()=>{
  const api=adapter(),held=deferred(),started=deferred(),context=ctx();fakes.choose.mockReturnValue(api);await openArena(context);
  api.select.mockImplementationOnce(()=>{started.resolve();return held.promise;});
  const opening=openArena({...context,duelId:'recorded-old'});await started.promise;
  document.hidden=true;listeners.get('visibilitychange')();held.resolve(detail('recorded-old'));await opening;
  expect(api.setVisible).toHaveBeenLastCalledWith(false);expect(fakes.reveals).toEqual([]);
});
