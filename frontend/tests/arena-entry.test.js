// Private entry tests use the actual session/lease registry and injected modules; never a browser or service.
import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {registerPanelServices} from '../src/online/panel-services.js';
import {createArenaEntry} from '../src/online/arena-entry.js';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function settle(){for(let step=0;step<20;step++)await Promise.resolve();}
function arenaModule(){
  let opened=false,generation=0,owner=null;
  const replies=[],selected=[];
  const module={
    openArena:vi.fn(async ctx=>{
      const identity=ctx.getIdentity?.();
      if(owner&&(owner.request!==ctx.request||owner.getIdentity!==ctx.getIdentity||!Object.is(owner.identity,identity))){opened=false;generation+=1;}
      owner={request:ctx.request,getIdentity:ctx.getIdentity,identity};
      if(opened)return; // The real panel focuses rather than retargeting an open dialog.
      opened=true;const mine=++generation,reply=replies.shift();if(reply)await reply(ctx);
      if(opened&&mine===generation&&ctx.duelId!==undefined)selected.push(ctx.duelId);
    }),
    closeArena:vi.fn(()=>{opened=false;generation+=1;}),
    disposeArena:vi.fn(()=>{opened=false;owner=null;generation+=1;}),
    isArenaOpen:()=>opened,replies,selected,
  };return module;
}
const fixtures=[];
function setup(options={}){
  const {ready=true,signedIn=true,registered=true,search='',dev=false,module=arenaModule(),load}=options;
  const flag=Object.hasOwn(options,'flag')?options.flag:true;
  const session=createSession();if(signedIn)session.setToken(`fixture-${randomUUID()}`);
  let flags={arena:flag},isReady=ready;
  const api={get:vi.fn(async()=>{throw new Error('No service is part of this entry fixture');}),post:vi.fn(async()=>{throw new Error('No service is part of this entry fixture');})};
  const leases=[],notify=vi.fn(),onSignIn=vi.fn(),resetInput=vi.fn(),focus=vi.fn(),container={};
  const register=()=>{const lease=registerPanelServices(session,{api,publicApi:api,getFlags:()=>flags,isReady:()=>isReady});leases.push(lease);return lease;};
  let lease=registered?register():null;
  const loader=load??vi.fn(async()=>module),entry=createArenaEntry({session,container,resetInput,focus,onSignIn,notify,search,dev,load:loader});
  const f={session,api,leases,module,entry,loader,notify,onSignIn,resetInput,focus,container,
    get lease(){return lease;},replace(){lease=register();return lease;},
    flags(value){flags={...flags,...value};lease?.refresh();},ready(value){isReady=value;lease?.refresh();},
  };fixtures.push(f);return f;
}
afterEach(()=>{for(const f of fixtures.splice(0)){f.entry.dispose();for(const lease of f.leases)lease.dispose();}});

describe('private app-owned arena entry',()=>{
  it.each([undefined,false,'false','true',1])('loads no module for strict non-true arena=%s',async flag=>{
    const f=setup({flag});await f.entry.open();expect(f.loader).not.toHaveBeenCalled();expect(f.entry.active).toBe(false);
    expect(f.api.get).not.toHaveBeenCalled();expect(f.api.post).not.toHaveBeenCalled();
  });
  it('fails closed for missing provider, unready config and ordinary demo before any import',async()=>{
    for(const options of [{registered:false},{ready:false},{search:'?demo=1'}]){
      const f=setup(options);await f.entry.open(randomUUID());expect(f.loader).not.toHaveBeenCalled();
      expect(f.notify).toHaveBeenCalledWith('The ring is closed for now.');
    }
  });
  it('passes the anonymous true-flag lease to the module sign-in state without an authenticated call',async()=>{
    const f=setup({signedIn:false});await f.entry.open();const ctx=f.module.openArena.mock.calls[0][0];
    expect(ctx.request).toBe(f.lease.request);expect(ctx.getIdentity).toBe(f.lease.getIdentity);expect(ctx.getIdentity()).toBeNull();
    expect(ctx.onIdentityChange).toBe(f.lease.onIdentityChange);expect(ctx.onSignIn).toBe(f.onSignIn);
    expect(f.api.get).not.toHaveBeenCalled();expect(f.api.post).not.toHaveBeenCalled();
  });
  it('allows only explicit dev practice without a live capability and keeps production local fail-closed',async()=>{
    const f=setup({registered:false,dev:true,search:'?demo=1&arena=local'});await f.entry.open();
    const ctx=f.module.openArena.mock.calls[0][0];expect(ctx.request).toBeUndefined();expect(ctx.getIdentity()).toBeNull();
    const g=setup({registered:false,dev:false,search:'?arena=local'});await g.entry.open();expect(g.loader).not.toHaveBeenCalled();
  });
  it('reuses exact lease refs across ordinary close/reopen and leaves unfinished UID ownership in the module',async()=>{
    const f=setup();await f.entry.open();const first=f.module.openArena.mock.calls[0][0];
    f.entry.close();expect(f.module.closeArena).toHaveBeenCalledOnce();expect(f.module.disposeArena).not.toHaveBeenCalled();
    await f.entry.open();const next=f.module.openArena.mock.calls[1][0];
    for(const key of ['request','getIdentity','onIdentityChange','getFlags','getToken'])expect(next[key]).toBe(first[key]);
    expect(next.request).toBe(f.lease.request);expect(f.loader).toHaveBeenCalledOnce();expect(f.entry.active).toBe(true);
  });
  it('cancels pending import on close/dispose without a late open or stale finally erasing its replacement',async()=>{
    const imported=deferred(),module=arenaModule(),loader=vi.fn(()=>imported.promise),f=setup({module,load:loader});
    const old=f.entry.open();expect(loader).toHaveBeenCalledOnce();expect(f.entry.pending).toBe(true);expect(f.entry.active).toBe(true);f.entry.close();
    const id=randomUUID(),latest=f.entry.open(id);expect(f.entry.pending).toBe(true);
    imported.resolve(module);await old;await latest;expect(module.openArena).toHaveBeenCalledOnce();
    expect(module.openArena.mock.calls[0][0].duelId).toBe(id);expect(f.entry.pending).toBe(false);
    const gone=deferred(),g=setup({load:()=>gone.promise}),pending=g.entry.open();g.entry.dispose();gone.resolve(arenaModule());await pending;
    expect(g.entry.active).toBe(false);expect(g.entry.pending).toBe(false);
  });
  it('ordinary-closes a pending detail before forwarding its newer target to the real panel contract',async()=>{
    const f=setup(),held=deferred(),newDetail=deferred(),first=randomUUID(),latest=randomUUID();
    f.module.replies.push(()=>held.promise,()=>newDetail.promise);
    const old=f.entry.open(first);await settle();expect(f.entry.pending).toBe(true);
    const newer=f.entry.open(latest);await settle();expect(f.module.closeArena).toHaveBeenCalledOnce();expect(f.module.disposeArena).not.toHaveBeenCalled();
    held.resolve();await old;expect(f.entry.pending).toBe(true);expect(f.module.selected).toEqual([]);
    newDetail.resolve();await newer;expect(f.module.selected).toEqual([latest]);expect(f.entry.active).toBe(true);
  });
  it('closes a pending module open on Escape-like close while retaining its adapter for a later open',async()=>{
    const f=setup(),held=deferred();f.module.replies.push(()=>held.promise);const pending=f.entry.open();await settle();
    f.entry.close();expect(f.entry.pending).toBe(false);expect(f.entry.active).toBe(false);expect(f.module.closeArena).toHaveBeenCalledOnce();
    held.resolve();await pending;await f.entry.open();expect(f.entry.active).toBe(true);expect(f.module.disposeArena).not.toHaveBeenCalled();
  });
  it('rejects an arena flag blink during import but ignores unrelated flag changes',async()=>{
    const imported=deferred(),module=arenaModule(),f=setup({module,load:()=>imported.promise});
    const old=f.entry.open();f.flags({arena:false});expect(f.entry.pending).toBe(false);f.flags({arena:true});
    const latest=f.entry.open(randomUUID());f.flags({market:true});expect(f.entry.pending).toBe(true);
    imported.resolve(module);await old;await latest;expect(module.openArena).toHaveBeenCalledOnce();expect(module.disposeArena).not.toHaveBeenCalled();
    f.flags({predictions:true});expect(f.entry.active).toBe(true);expect(module.disposeArena).not.toHaveBeenCalled();
    f.flags({arena:false});expect(f.entry.active).toBe(false);expect(module.disposeArena).toHaveBeenCalledOnce();
  });
  it('invalidates a deferred open on arena policy change without letting its completion affect a later opening',async()=>{
    const f=setup(),held=deferred(),latest=randomUUID();f.module.replies.push(()=>held.promise);
    const old=f.entry.open(randomUUID());await settle();f.flags({arena:false});
    expect(f.entry.pending).toBe(false);expect(f.module.disposeArena).toHaveBeenCalledOnce();
    f.flags({arena:true});await f.entry.open(latest);held.resolve();await old;
    expect(f.module.disposeArena).toHaveBeenCalledOnce();expect(f.module.selected).toEqual([latest]);expect(f.entry.active).toBe(true);
  });
  it('synchronously disposes private UI for identity/readiness/provider replacement and adopts only the exact new lease',async()=>{
    const f=setup();await f.entry.open();f.session.clearToken();expect(f.entry.active).toBe(false);expect(f.module.disposeArena).toHaveBeenCalledOnce();
    f.session.setToken(`fixture-${randomUUID()}`);await f.entry.open();f.ready(false);expect(f.entry.active).toBe(false);
    f.ready(true);await f.entry.open();const old=f.lease;f.replace();expect(f.entry.active).toBe(false);expect(f.module.disposeArena).toHaveBeenCalledTimes(3);
    await f.entry.open();const ctx=f.module.openArena.mock.calls.at(-1)[0];expect(ctx.request).toBe(f.lease.request);expect(ctx.request).not.toBe(old.request);
  });
  it('does not let old cross-session cleanup or an old deferred import touch the newer module owner',async()=>{
    const module=arenaModule(),imported=deferred(),a=setup({module,load:()=>imported.promise}),b=setup({module});
    const old=a.entry.open(randomUUID());await b.entry.open(randomUUID());expect(b.entry.active).toBe(true);
    imported.resolve(module);await old;expect(module.openArena).toHaveBeenCalledOnce();a.entry.close();a.entry.dispose();
    expect(module.closeArena).not.toHaveBeenCalled();expect(module.disposeArena).not.toHaveBeenCalled();expect(b.entry.active).toBe(true);
    const held=deferred(),c=setup({module});module.replies.push(()=>held.promise);const pending=c.entry.open(randomUUID());await settle();
    await b.entry.open(randomUUID());const disposals=module.disposeArena.mock.calls.length,closes=module.closeArena.mock.calls.length;
    c.entry.invalidate();held.resolve();await pending;expect(module.disposeArena).toHaveBeenCalledTimes(disposals);expect(module.closeArena).toHaveBeenCalledTimes(closes);expect(b.entry.active).toBe(true);
  });
  it('does not publish a late old-session open error after another owner took the same module',async()=>{
    const module=arenaModule(),failed=deferred(),a=setup({module}),b=setup({module});module.replies.push(()=>failed.promise);
    const old=a.entry.open(randomUUID());await settle();await b.entry.open(randomUUID());
    failed.reject(new Error(randomUUID()));await old;
    expect(a.notify).not.toHaveBeenCalled();expect(module.closeArena).not.toHaveBeenCalled();expect(module.disposeArena).not.toHaveBeenCalled();expect(b.entry.active).toBe(true);
  });
  it('catches import/open errors with fixed public words and never includes private arguments',async()=>{
    const privateValue=randomUUID(),f=setup({load:()=>Promise.reject(new Error(privateValue))});await f.entry.open(privateValue);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('Something went wrong. Try again.');expect(f.entry.pending).toBe(false);
    const g=setup();g.module.openArena.mockRejectedValueOnce(new Error(privateValue));await g.entry.open(privateValue);
    expect(g.notify).toHaveBeenCalledExactlyOnceWith('Something went wrong. Try again.');expect(g.module.disposeArena).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.notify.mock.calls)).not.toContain(privateValue);expect(JSON.stringify(g.notify.mock.calls)).not.toContain(privateValue);
  });
});
