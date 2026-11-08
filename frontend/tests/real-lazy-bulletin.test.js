// Optional-reader import lifetime stays private and uses injected modules only.
import {describe,it,expect,vi} from 'vitest';
import {createLazyBulletin} from '../src/online/case-adapter/lazy-bulletin.js';
const deferred = () => { let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve}; };
function surface(extra = {}) {
  const listeners = new Map();
  return {...extra,addEventListener:(name,fn) => { const set=listeners.get(name)??new Set();set.add(fn);listeners.set(name,set); },
    removeEventListener:(name,fn) => listeners.get(name)?.delete(fn),
    emit:name => {for (const fn of [...listeners.get(name)??[]]) fn();},
    count:() => [...listeners.values()].reduce((sum,set)=>sum+set.size,0)};
}
function setup(flag = true, suppliedLoad) {
  let identity=0,closed=false;
  const state={config:{flags:{bulletin:flag}}},commits=[];
  const document=surface({hidden:false}),window=surface();
  const store={scope:()=>identity,isClosed:()=>closed,commit:patch=>{Object.assign(state,patch);commits.push(patch);}};
  const reader={refresh:vi.fn(async()=>({ok:true})),stop:vi.fn(),dispose:vi.fn(),read:()=>({status:'ready'})};
  const module={createOnlineBulletin:vi.fn(()=>reader)},load=suppliedLoad??vi.fn(async()=>module);
  const ctx={store,state,document,window},owner=createLazyBulletin(ctx,{load});
  return {owner,reader,module,load,ctx,commits,document,window,
    identity:()=>{identity+=1;},closeStore:()=>{closed=true;}};
}
describe('strict lazy public bulletin ownership',()=>{
  it('starts a fresh-scope load while an older scope import is still held',async()=>{
    const old=deferred(),fresh=deferred(),item=setup();
    item.load.mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>fresh.promise);
    const stale=item.owner.refresh();await Promise.resolve();item.identity();
    const current=item.owner.refresh();await Promise.resolve();expect(item.load).toHaveBeenCalledTimes(2);
    fresh.resolve(item.module);expect((await current).ok).toBe(true);
    old.resolve(item.module);expect((await stale).ok).toBe(false);
    expect(item.module.createOnlineBulletin).toHaveBeenCalledOnce();item.owner.dispose();
  });
  it('clears a retained ready hook after disposal even when the store still holds its old public view',async()=>{
    const item=setup();await item.owner.refresh();
    item.ctx.state.bulletin={status:'ready',chapterTwoHook:{id:'recorded-hook'}};
    expect(item.owner.read().status).toBe('ready');item.owner.dispose();
    expect(item.owner.read()).toMatchObject({status:'off',chapterTwoHook:null});
  });
  it.each([false,undefined,'true',1])('does not import for non-true flag %s',async flag=>{
    const item=setup(flag);if(flag===undefined)delete item.ctx.state.config.flags.bulletin;
    expect((await item.owner.refresh()).ok).toBe(false);expect(item.load).not.toHaveBeenCalled();
    expect(item.owner.read().status).toBe('off');item.owner.dispose();
  });
  it('shares one lazy module and forwards refresh settings without any account capability',async()=>{
    const item=setup();await Promise.all([item.owner.refresh(),item.owner.refresh({force:true})]);
    expect(item.load).toHaveBeenCalledOnce();expect(item.module.createOnlineBulletin).toHaveBeenCalledOnce();
    expect(item.reader.refresh).toHaveBeenCalledWith({force:true});
    expect(item.module.createOnlineBulletin.mock.calls[0][0]).toBe(item.ctx);item.owner.dispose();
  });
  it.each(['stop','dispose','scope','off','hidden','store'])('ignores a late module after %s',async action=>{
    const held=deferred(),load=vi.fn(()=>held.promise),item=setup(true,load);
    const result=item.owner.refresh();await Promise.resolve();
    if(action==='scope')item.identity();else if(action==='off')item.ctx.state.config.flags.bulletin=false;
    else if(action==='hidden')item.document.hidden=true;else if(action==='store')item.closeStore();else item.owner[action]();
    held.resolve(item.module);expect((await result).ok).toBe(false);expect(item.module.createOnlineBulletin).not.toHaveBeenCalled();
    item.owner.dispose();
  });
  it('cancels even the queued loader before dispatch',async()=>{
    const item=setup(),result=item.owner.refresh();item.owner.stop();await result;
    expect(item.load).not.toHaveBeenCalled();item.owner.dispose();
  });
  it('starts a hidden initial load only on a genuine visible wake',async()=>{
    const item=setup();item.document.hidden=true;await item.owner.refresh();expect(item.load).not.toHaveBeenCalled();
    item.document.hidden=false;item.document.emit('visibilitychange');
    await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(item.load).toHaveBeenCalledOnce();item.owner.dispose();
    expect(item.document.count()+item.window.count()).toBe(0);
  });
  it('keeps the loaded reader for a later flag-on and clears it on ordinary stop',async()=>{
    const item=setup();await item.owner.refresh();item.ctx.state.config.flags.bulletin=false;await item.owner.refresh();
    expect(item.reader.stop).toHaveBeenCalledOnce();item.ctx.state.config.flags.bulletin=true;await item.owner.refresh();
    expect(item.load).toHaveBeenCalledOnce();expect(item.reader.refresh).toHaveBeenCalledTimes(2);item.owner.dispose();
  });
  it('uses only fixed failure copy and permits an explicit later import attempt',async()=>{
    const item=setup();item.load.mockRejectedValueOnce(new Error('private server material'));
    expect((await item.owner.refresh()).reason).toBe('not_connected');
    expect(item.ctx.state.bulletin.status).toBe('unavailable');expect(JSON.stringify(item.commits)).not.toContain('private');
    expect((await item.owner.refresh({force:true})).ok).toBe(true);item.owner.dispose();
  });
  it('does not deliver an old reader receipt across scope change or mutate a disposed store',async()=>{
    const item=setup(),held=deferred();item.reader.refresh.mockImplementation(()=>held.promise);
    const result=item.owner.refresh();for(let n=0;n<8;n++)await Promise.resolve();item.identity();
    held.resolve({ok:true,bulletin:{status:'ready'}});expect((await result).ok).toBe(false);
    const count=item.commits.length;item.owner.dispose();await item.owner.refresh();
    expect(item.commits).toHaveLength(count);expect(item.reader.dispose).toHaveBeenCalledOnce();
  });
});
