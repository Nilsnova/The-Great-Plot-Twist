// Manual read confirmation is authoritative and belongs to the exact held trade/account.
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {createTrades} from '../../src/screens/market/trades.js';
import {createMarketSession} from '../../src/screens/market/session.js';

const okay=data=>({ok:true,data});
const unknown=()=>({ok:false,code:'outcome_unknown',status:503});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function settle(){for(let step=0;step<40;step++)await Promise.resolve();}
function setup(){
  const intent={companyId:randomUUID(),side:'rising',stake:100};
  const adapter={board:vi.fn(async()=>okay({companies:[],rules:{stakeChoices:[]}})),
    portfolio:vi.fn(async()=>okay({positions:[],recentlyClosed:[],coins:1000})),
    open:vi.fn(async()=>unknown()),close:vi.fn(async()=>unknown())};
  const session=createMarketSession({adapter});
  let time=0;const trades=createTrades({adapter,session,makeUid:()=>randomUUID(),now:()=>time});
  return {intent,adapter,session,trades,setTime:value=>{time=value;}};
}

describe('market manual check ownership',()=>{
  it.each([
    {status:0,code:'network_error'},
    {status:503,code:'database_unavailable'},
    {status:429,code:'too_many_requests',retryAfterSeconds:3},
  ])('does not claim checked or discard the unknown uid after a $code read',async failure=>{
    const f=setup();await (await f.trades.open(f.intent)).refreshed;const held=f.trades.pending;
    f.adapter.portfolio.mockResolvedValueOnce({ok:false,...failure});
    expect(await f.trades.checkAgain()).toMatchObject({kind:'unknown',code:failure.code});
    expect(f.trades.pending).toBe(held);expect(f.trades.busy).toBe(false);
    expect(f.adapter.open).toHaveBeenCalledOnce();expect(f.adapter.close).not.toHaveBeenCalled();
    if(failure.status===429){
      expect(f.trades.retryAfterSeconds).toBe(3);expect((await f.trades.checkAgain()).kind).toBe('rate_limited');
      f.setTime(3000);
    }
    expect((await f.trades.checkAgain()).kind).toBe('checked');expect(f.trades.pending).toBe(held);
    expect(f.trades.forget().kind).toBe('forgotten');expect(f.adapter.open).toHaveBeenCalledOnce();
    f.session.dispose();
  });

  it('keeps a thrown check uncertain without claiming that the positions were updated',async()=>{
    const f=setup();await (await f.trades.open(f.intent)).refreshed;const held=f.trades.pending;
    f.adapter.portfolio.mockRejectedValueOnce(new Error('Recorded read failure'));
    const result=await f.trades.checkAgain();
    expect(result).toMatchObject({kind:'unknown',code:'network_error'});expect(result.message).not.toContain('Updated your positions');
    expect(f.trades.pending).toBe(held);expect(f.adapter.open).toHaveBeenCalledOnce();f.session.dispose();
  });

  it('waits for the prior readback and then a new accepted read before claiming checked',async()=>{
    const f=setup(),old=deferred(),fresh=deferred();
    f.adapter.portfolio.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first=await f.trades.open(f.intent),attempt=f.trades.pending;
    let finished=false;const checking=f.trades.checkAgain().then(result=>{finished=true;return result;});
    await settle();expect(f.adapter.portfolio).toHaveBeenCalledOnce();
    old.resolve(okay({positions:[],recentlyClosed:[],coins:1000}));await first.refreshed;await settle();
    expect(f.adapter.portfolio).toHaveBeenCalledTimes(2);expect(finished).toBe(false);
    fresh.resolve(okay({positions:[],recentlyClosed:[],coins:1000}));
    expect((await checking).kind).toBe('checked');expect(f.trades.pending).toBe(attempt);
    expect(f.adapter.open).toHaveBeenCalledOnce();f.session.dispose();
  });

  it('holds the existing attempt while checking, blocking Forget, duplicate checks and a new trade',async()=>{
    const f=setup();await (await f.trades.open(f.intent)).refreshed;const held=deferred();
    f.adapter.portfolio.mockReturnValueOnce(held.promise);const checking=f.trades.checkAgain(),attempt=f.trades.pending;
    await settle();expect(f.adapter.portfolio).toHaveBeenCalledTimes(2);
    expect(f.trades.busy).toBe(true);expect(f.trades.forget().kind).toBe('nothing');
    expect((await f.trades.checkAgain()).kind).toBe('busy');
    expect((await f.trades.open({...f.intent,side:'falling'})).kind).toBe('busy');
    held.resolve(okay({positions:[],recentlyClosed:[],coins:1000}));expect((await checking).kind).toBe('checked');
    expect(f.trades.pending).toBe(attempt);expect(f.adapter.open).toHaveBeenCalledOnce();f.session.dispose();
  });

  it('cannot let an old accepted check authorize a replacement account or unlock its pending write',async()=>{
    const f=setup();await (await f.trades.open(f.intent)).refreshed;const old=deferred(),fresh=deferred();
    f.adapter.portfolio.mockReturnValueOnce(old.promise);const checking=f.trades.checkAgain();
    await settle();expect(f.adapter.portfolio).toHaveBeenCalledTimes(2);
    f.trades.resetPrivate();f.session.resetPrivate(true);f.adapter.open.mockReturnValueOnce(fresh.promise);
    const writing=f.trades.open({...f.intent,side:'falling'});
    old.resolve(okay({positions:[],recentlyClosed:[],coins:1000}));expect((await checking).kind).toBe('expired');
    expect(f.trades.busy).toBe(true);expect(f.trades.pending).toBeNull();
    fresh.resolve(unknown());await (await writing).refreshed;expect(f.trades.busy).toBe(false);
    expect(f.trades.pending.intent.side).toBe('falling');expect(f.adapter.open).toHaveBeenCalledTimes(2);f.session.dispose();
  });

  it('does not start a read without a held trade',async()=>{
    const f=setup();expect((await f.trades.checkAgain()).kind).toBe('nothing');
    expect(f.adapter.portfolio).not.toHaveBeenCalled();f.session.dispose();
  });
});
