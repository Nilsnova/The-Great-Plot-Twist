// Public credit metadata is scoped to actual provider leases; clients and sessions are injected.
import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {registerPanelServices} from '../src/online/panel-services.js';
import {createMarketPolicy} from '../src/online/market-policy.js';
import {cacheMarketCredits,readMarketCredits} from '../src/online/market-credits.js';

const good=data=>({ok:true,status:200,data});
const source=text=>({text,href:'https://example.invalid/recorded-source',licenceText:'Recorded licence',licenceHref:'https://example.invalid/recorded-licence'});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const cleanups=[];
function setup({session=createSession(),flags={market:true},publicGet,privateGet}={}){
  if(!session.isSignedIn())session.setToken(`fixture-${randomUUID()}`);
  const state={ready:true,flags};
  const api={get:vi.fn(privateGet??(async()=>good({}))),post:vi.fn(async()=>good({}))};
  const publicApi={get:vi.fn(publicGet??(async()=>good({credits:[source('Recorded source')]})))};
  const options={api,publicApi,getFlags:()=>state.flags,isReady:()=>state.ready};
  const lease=registerPanelServices(session,options),policy=createMarketPolicy(lease);
  cleanups.push(()=>{policy.dispose();lease.dispose();});
  return{session,state,api,publicApi,options,lease,policy};
}
afterEach(()=>{for(const stop of cleanups.splice(0))stop();});

describe('current public market credit cache',()=>{
  it('keeps explicit sessions and provider leases isolated without a default-session fallback',async()=>{
    const first=setup({publicGet:async()=>good({credits:[source('First recorded source')]})});
    const second=setup({publicGet:async()=>good({credits:[source('Second recorded source')]})});
    await first.policy.publicGet('/api/market');
    expect(readMarketCredits(first.session)).toEqual([source('First recorded source')]);
    expect(readMarketCredits(second.session)).toEqual([]);expect(readMarketCredits()).toEqual([]);
    expect(readMarketCredits({})).toEqual([]);
    await second.policy.publicGet('/api/market');
    expect(readMarketCredits(first.session)[0].text).toBe('First recorded source');
    expect(readMarketCredits(second.session)[0].text).toBe('Second recorded source');
    expect(first.api.get).not.toHaveBeenCalled();expect(second.api.get).not.toHaveBeenCalled();
  });

  it('retains public metadata on ordinary policy close and reads it from a new policy for the same lease',async()=>{
    const f=setup({flags:{market:false}});await f.policy.publicGet('/api/market');f.policy.dispose();
    expect(readMarketCredits(f.session)).toEqual([source('Recorded source')]);
    const reopened=createMarketPolicy(f.lease);cleanups.push(()=>reopened.dispose());
    expect((await reopened.publicGet('/api/market')).ok).toBe(true);
    expect(readMarketCredits(f.session)).toEqual([source('Recorded source')]);
  });

  it.each(['policy dispose','lease dispose','provider replacement','identity change','readiness loss'])(
    'does not publish a late public reply after %s',async boundary=>{
      const held=deferred(),f=setup({publicGet:()=>held.promise}),pending=f.policy.publicGet('/api/market');
      if(boundary==='policy dispose')f.policy.dispose();
      if(boundary==='lease dispose')f.lease.dispose();
      if(boundary==='provider replacement'){
        const next=registerPanelServices(f.session,f.options);cleanups.push(()=>next.dispose());
      }
      if(boundary==='identity change'){f.session.clearToken();f.session.setToken(`fixture-${randomUUID()}`);}
      if(boundary==='readiness loss'){f.state.ready=false;f.lease.refresh();f.state.ready=true;f.lease.refresh();}
      held.resolve(good({credits:[source('Late recorded source')]}));
      expect((await pending).ok).toBe(false);expect(readMarketCredits(f.session)).toEqual([]);
    });

  it('does not let an obsolete provider overwrite a replacement provider cache',async()=>{
    const held=deferred(),old=setup({publicGet:()=>held.promise}),pending=old.policy.publicGet('/api/market');
    const newer=setup({session:old.session,publicGet:async()=>good({credits:[source('Current recorded source')]})});
    await newer.policy.publicGet('/api/market');held.resolve(good({credits:[source('Old recorded source')]}));
    expect((await pending).ok).toBe(false);
    expect(readMarketCredits(newer.session)).toEqual([source('Current recorded source')]);
  });

  it('publishes only accepted public /api/market answers, preserving a good cache for other replies',async()=>{
    const f=setup();await f.policy.publicGet('/api/market');const before=readMarketCredits(f.session);
    f.publicApi.get.mockResolvedValueOnce({ok:false,status:503,data:{credits:[source('Rejected source')]}});
    await f.policy.publicGet('/api/market');expect(readMarketCredits(f.session)).toEqual(before);
    f.api.get.mockResolvedValueOnce(good({credits:[source('Private portfolio source')]}));
    await f.policy.request('/api/market/portfolio');expect(readMarketCredits(f.session)).toEqual(before);
    f.publicApi.get.mockResolvedValueOnce(good({credits:[source('Other public route source')]}));
    await f.policy.publicGet('/api/sports');expect(readMarketCredits(f.session)).toEqual(before);
    f.publicApi.get.mockResolvedValueOnce(good({credits:null}));
    await f.policy.publicGet('/api/market');expect(readMarketCredits(f.session)).toEqual(before);
    f.publicApi.get.mockResolvedValueOnce(good({credits:[]}));
    await f.policy.publicGet('/api/market');expect(readMarketCredits(f.session)).toEqual([]);
  });

  it('keeps exact display fields and only HTTPS links without URL credentials',()=>{
    const f=setup(),secret=`private-${randomUUID()}`;
    const rows=[{...source('Recorded vendor'),secret,playerId:randomUUID()},
      {text:'No links',href:'http://example.invalid/source',licenceText:17,licenceHref:'javascript:alert(1)'},
      {text:'Credential URL',href:'https://user:password@example.invalid/source',licenceText:null,licenceHref:'data:text/plain,recorded'},
      {text:'Missing links'},{text:7},null,[]];
    const ticket=f.lease.capture('market',{allowFlagOff:true});
    expect(cacheMarketCredits(f.lease,rows,()=>f.lease.current(ticket))).toBe(true);
    expect(readMarketCredits(f.session)).toEqual([source('Recorded vendor'),
      {text:'No links',href:null,licenceText:null,licenceHref:null},
      {text:'Credential URL',href:null,licenceText:null,licenceHref:null},
      {text:'Missing links',href:null,licenceText:null,licenceHref:null}]);
    expect(JSON.stringify(readMarketCredits(f.session))).not.toContain(secret);
  });

  it('gives callers and cached replies independent row objects',async()=>{
    const row=source('Recorded source'),f=setup({publicGet:async()=>good({credits:[row]})});
    await f.policy.publicGet('/api/market');row.text='Changed response';row.href='https://example.invalid/changed';
    const read=readMarketCredits(f.session);read[0].text='Changed caller';read.push(source('Caller row'));
    expect(readMarketCredits(f.session)).toEqual([source('Recorded source')]);
  });

  it('rejects a projection whose getter invalidates the actual lease while retaining prior public credits',async()=>{
    const f=setup();await f.policy.publicGet('/api/market');const before=readMarketCredits(f.session);
    const row={text:'Obsolete recorded source',get href(){f.lease.invalidate();return'https://example.invalid/obsolete';}};
    f.publicApi.get.mockResolvedValueOnce(good({credits:[row]}));
    expect((await f.policy.publicGet('/api/market')).ok).toBe(false);
    expect(readMarketCredits(f.session)).toEqual(before);
  });

  it('refuses invalid cache inputs or an already invalidated current predicate without clearing prior rows',async()=>{
    const f=setup();await f.policy.publicGet('/api/market');const before=readMarketCredits(f.session);
    expect(cacheMarketCredits(null,[],()=>true)).toBe(false);
    expect(cacheMarketCredits(f.lease,{},()=>true)).toBe(false);
    expect(cacheMarketCredits(f.lease,[],null)).toBe(false);
    expect(cacheMarketCredits(f.lease,[],()=>false)).toBe(false);
    expect(cacheMarketCredits(f.lease,[],()=>1)).toBe(false);
    expect(cacheMarketCredits(f.lease,[],()=>({}))).toBe(false);
    expect(readMarketCredits(f.session)).toEqual(before);
  });

  it('requires a Boolean current guard again after projecting supplied row getters',async()=>{
    const f=setup();await f.policy.publicGet('/api/market');const before=readMarketCredits(f.session);
    let current=true;
    const row={text:'Obsolete recorded source',get href(){current=1;return'https://example.invalid/obsolete';}};
    expect(cacheMarketCredits(f.lease,[row],()=>current)).toBe(false);
    expect(readMarketCredits(f.session)).toEqual(before);
  });
});
