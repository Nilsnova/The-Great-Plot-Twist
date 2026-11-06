// The GET monitor uses injected state, fake time and event surfaces; no API, browser or credentials.
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createReadMonitor} from '../src/online/case-adapter/read-monitor.js';

function surface(extra={}){
  const listeners=new Map();
  return {...extra,listeners,
    addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);},
    removeEventListener(name,listener){listeners.get(name)?.delete(listener);},
    emit(name){for(const listener of [...listeners.get(name)??[]])listener();},
  };
}
const active=[];
function setup(){
  const commits=[],document=surface({hidden:false}),window=surface();let closed=false;
  const store={isClosed:()=>closed,commit:patch=>commits.push(structuredClone(patch))};
  const monitor=createReadMonitor({store,document,window,now:Date.now});active.push(monitor);
  return {monitor,commits,document,window,closeStore(){closed=true;}};
}
const failed=status=>({status,mapped:{accepted:false,reason:status===401?'session_expired':'unknown',
  message:'private account and server detail'}});
const success={status:200,mapped:{accepted:true}};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>{for(const monitor of active.splice(0))monitor.dispose();vi.useRealTimers();});

describe('read presentation and held failures',()=>{
  it('keeps quick reads quiet, announces loading at300ms and slow reads at5s',async()=>{
    const {monitor,commits}=setup();const finish=monitor.begin('me');
    await vi.advanceTimersByTimeAsync(299);expect(commits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);expect(monitor.read()).toMatchObject({state:'loading',message:'Loading…'});
    await vi.advanceTimersByTimeAsync(4699);expect(monitor.read().state).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);expect(monitor.read().state).toBe('slow');
    expect(monitor.read().message).toContain('taking longer');
    finish(success);expect(monitor.read().state).toBe('idle');expect(vi.getTimerCount()).toBe(0);
    const quick=monitor.begin('save');quick(success);const before=commits.length;
    await vi.advanceTimersByTimeAsync(6000);expect(commits).toHaveLength(before);
  });
  it('retains each failure across other successes and replacement requests until that kind succeeds',async()=>{
    const {monitor}=setup();monitor.begin('me')(failed(503));
    monitor.begin('crew')(success);expect(monitor.read()).toMatchObject({state:'error',reason:'not_connected'});
    const finish=monitor.begin('me');await vi.advanceTimersByTimeAsync(5000);
    expect(monitor.read().reason).toBe('not_connected');
    monitor.begin('save')(failed(0));expect(monitor.read().reason).toBe('offline');
    finish(success);expect(monitor.read().reason).toBe('offline');
    monitor.begin('save')(success);expect(monitor.read()).toMatchObject({state:'online',reason:null});
  });
  it('keeps expiry ahead of other failures and never stores response/error details',()=>{
    const {monitor,commits}=setup();monitor.begin('me')(failed(401));monitor.begin('crew')(failed(0));
    expect(monitor.read()).toMatchObject({state:'expired',reason:'session_expired'});
    expect(monitor.read().message).toContain('progress on this device is kept');
    monitor.begin('me')(success);expect(monitor.read().state).toBe('offline');
    monitor.begin('save')({status:502,mapped:{accepted:false,reason:'private id',message:'private account'}});
    expect(monitor.read().reason).toBe('internal_error');
    expect(JSON.stringify(commits)).not.toContain('private');
    for(const patch of commits){expect(Object.keys(patch)).toEqual(['connection']);
      expect(Object.keys(patch.connection).sort()).toEqual(['message','reason','state']);}
  });
  it('ignores old same-kind completions and repeated finishes',()=>{
    const {monitor,commits}=setup(),old=monitor.begin('me'),current=monitor.begin('me');
    expect(old(failed(0))).toBe(false);expect(current(success)).toBe(true);
    const count=commits.length;expect(current(failed(401))).toBe(false);expect(commits).toHaveLength(count);
    expect(monitor.read().state).toBe('idle');
  });
});

describe('bounded GET retry',()=>{
  it('monitors ledger recovery using only safe status and the same bounded GET delays',async()=>{
    const {monitor,commits}=setup();let attempts=0;
    const retry=vi.fn(()=>monitor.begin('ledger',{automatic:true,retry})(++attempts===1?failed(503):success));
    monitor.begin('ledger',{retry})(failed(0));
    await vi.advanceTimersByTimeAsync(4999);expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(retry).toHaveBeenCalledOnce();expect(monitor.read().reason).toBe('not_connected');
    await vi.advanceTimersByTimeAsync(15000);expect(retry).toHaveBeenCalledTimes(2);expect(monitor.read().state).toBe('online');
    expect(JSON.stringify(commits)).not.toContain('private');
    await vi.advanceTimersByTimeAsync(5000);expect(monitor.read().state).toBe('idle');expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0,503])('retries status%s at5/15/30seconds, then waits for a manual read',async status=>{
    const {monitor}=setup();const retry=vi.fn(()=>monitor.begin('me',{automatic:true,retry})(failed(status)));
    monitor.begin('me',{retry})(failed(status));
    for(const [index,delay] of [5000,15000,30000].entries()){
      await vi.advanceTimersByTimeAsync(delay-1);expect(retry).toHaveBeenCalledTimes(index);
      await vi.advanceTimersByTimeAsync(1);expect(retry).toHaveBeenCalledTimes(index+1);
    }
    await vi.advanceTimersByTimeAsync(300000);expect(retry).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
    await monitor.retryFailed();expect(retry).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(5000);expect(retry).toHaveBeenCalledTimes(5);
  });
  it.each([401,403,404,409,429,502])('never automatically retries status%s',async status=>{
    const {monitor}=setup(),retry=vi.fn();monitor.begin('save',{retry})(failed(status));
    await vi.advanceTimersByTimeAsync(300000);expect(retry).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('leaves config automatic backoff to polling but allows a manual config retry',async()=>{
    const {monitor}=setup();const retry=vi.fn(()=>monitor.begin('config',{automatic:true,retry})(success));
    monitor.begin('config',{retry})(failed(503));await vi.advanceTimersByTimeAsync(300000);
    expect(retry).not.toHaveBeenCalled();await monitor.retryFailed();expect(retry).toHaveBeenCalledOnce();
    expect(monitor.read().state).toBe('online');
  });
  it('resets one manual read budget without resetting another failed kind',async()=>{
    const {monitor}=setup();const crew=vi.fn(()=>monitor.begin('crew',{automatic:true,retry:crew})(failed(0)));
    const save=vi.fn(()=>monitor.begin('save',{automatic:true,retry:save})(failed(0)));
    monitor.begin('crew',{retry:crew})(failed(0));monitor.begin('save',{retry:save})(failed(0));
    await vi.advanceTimersByTimeAsync(5000);expect(crew).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledOnce();
    monitor.begin('crew',{retry:crew})(failed(0));await vi.advanceTimersByTimeAsync(5000);
    expect(crew).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);expect(save).toHaveBeenCalledTimes(2);
  });
  it('keeps an in-flight retry independent of another failure and does not retry it twice',async()=>{
    const {monitor}=setup();let finish;
    const retry=vi.fn(()=>{finish=monitor.begin('me',{automatic:true,retry});});
    monitor.begin('me',{retry})(failed(0));await vi.advanceTimersByTimeAsync(5000);
    expect(retry).toHaveBeenCalledOnce();await monitor.retryFailed();expect(retry).toHaveBeenCalledOnce();
    monitor.begin('crew')(success);expect(monitor.read().reason).toBe('offline');
    finish(success);expect(monitor.read().state).toBe('online');
  });
  it('turns a failed retry callback into fixed error words without an unhandled rejection or loop',async()=>{
    const {monitor}=setup(),retry=vi.fn(()=>{throw new Error('private callback detail');});
    monitor.begin('me',{retry})(failed(0));await vi.advanceTimersByTimeAsync(5000);
    expect(monitor.read()).toMatchObject({state:'error',reason:'internal_error'});
    expect(monitor.read().message).not.toContain('private');expect(vi.getTimerCount()).toBe(0);
  });
  it('shares simultaneous manual retry taps and ignores an older callback error after a new successful read',async()=>{
    const {monitor}=setup();let reject;
    const retry=vi.fn(()=>{
      monitor.begin('me',{automatic:true,retry});
      return new Promise((resolve,failed)=>{reject=failed;});
    });
    monitor.begin('me',{retry})(failed(0));
    const first=monitor.retryFailed(),second=monitor.retryFailed();
    await Promise.resolve();expect(retry).toHaveBeenCalledOnce();
    monitor.begin('me')(success);reject(new Error('late private callback detail'));
    await Promise.all([first,second]);expect(monitor.read().state).toBe('online');
  });
});

describe('visibility, connection and cleanup',()=>{
  it('expires recovery words after five visible seconds and pauses the remaining notice while hidden',async()=>{
    const {monitor,document}=setup();monitor.begin('ledger')(failed(503));monitor.begin('ledger')(success);
    expect(monitor.read().state).toBe('online');await vi.advanceTimersByTimeAsync(2000);
    document.hidden=true;document.emit('visibilitychange');await vi.advanceTimersByTimeAsync(60000);
    expect(monitor.read().state).toBe('online');document.hidden=false;document.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(2999);expect(monitor.read().state).toBe('online');
    await vi.advanceTimersByTimeAsync(1);expect(monitor.read().state).toBe('idle');expect(vi.getTimerCount()).toBe(0);
  });
  it('invalidates an old recovery deadline on reset and gives a later recovery its full notice',async()=>{
    const {monitor}=setup();monitor.begin('me')(failed(0));monitor.begin('me')(success);
    await vi.advanceTimersByTimeAsync(1000);monitor.reset();expect(monitor.read().state).toBe('idle');
    monitor.begin('save')(failed(503));monitor.begin('save')(success);
    await vi.advanceTimersByTimeAsync(4000);expect(monitor.read().state).toBe('online');
    await vi.advanceTimersByTimeAsync(1000);expect(monitor.read().state).toBe('idle');
  });
  it('pauses remaining retry time while hidden and resumes it instead of sending immediately',async()=>{
    const {monitor,document}=setup();const retry=vi.fn(()=>monitor.begin('me',{automatic:true,retry})(success));
    monitor.begin('me',{retry})(failed(0));await vi.advanceTimersByTimeAsync(2000);
    document.hidden=true;document.emit('visibilitychange');await vi.advanceTimersByTimeAsync(60000);
    expect(retry).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    document.hidden=false;document.emit('visibilitychange');await vi.advanceTimersByTimeAsync(2999);
    expect(retry).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(retry).toHaveBeenCalledOnce();
  });
  it('pauses both presentation thresholds while hidden',async()=>{
    const {monitor,document}=setup();monitor.begin('save');await vi.advanceTimersByTimeAsync(200);
    document.hidden=true;document.emit('visibilitychange');await vi.advanceTimersByTimeAsync(60000);
    expect(monitor.read().state).toBe('idle');document.hidden=false;document.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(100);expect(monitor.read().state).toBe('loading');
    await vi.advanceTimersByTimeAsync(4700);expect(monitor.read().state).toBe('slow');
  });
  it('shows browser offline/back-online words without replaying a write or masking failed reads',async()=>{
    const {monitor,window}=setup(),retry=vi.fn();window.emit('offline');
    expect(monitor.read().state).toBe('offline');window.emit('online');expect(monitor.read().state).toBe('online');
    monitor.begin('save',{retry})(failed(503));window.emit('offline');window.emit('online');
    expect(monitor.read().reason).toBe('not_connected');expect(retry).not.toHaveBeenCalled();
  });
  it('reset cancels all jobs/callbacks and invalidates late request completions',async()=>{
    const {monitor,commits}=setup(),retry=vi.fn();monitor.begin('me',{retry})(failed(0));
    const old=monitor.begin('crew');monitor.reset();expect(monitor.read().state).toBe('idle');
    const count=commits.length;expect(old(failed(401))).toBe(false);await monitor.retryFailed();
    await vi.advanceTimersByTimeAsync(300000);expect(retry).not.toHaveBeenCalled();expect(commits).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disposal removes listeners and prevents late status, retry and timer work',async()=>{
    const {monitor,commits,document,window}=setup(),retry=vi.fn(),finish=monitor.begin('me',{retry});
    monitor.dispose();monitor.dispose();const count=commits.length;finish(failed(0));
    document.hidden=true;document.emit('visibilitychange');window.emit('offline');await monitor.retryFailed();
    await vi.advanceTimersByTimeAsync(300000);expect(commits).toHaveLength(count);expect(retry).not.toHaveBeenCalled();
    expect([...document.listeners.values(),...window.listeners.values()].every(set=>set.size===0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does no work after its store closes and refuses unknown read kinds',async()=>{
    const {monitor,closeStore,commits}=setup();expect(()=>monitor.begin('post-save')).toThrow('Unknown read kind');
    const finish=monitor.begin('config');closeStore();finish(failed(503));await vi.advanceTimersByTimeAsync(6000);
    expect(commits).toEqual([]);expect(monitor.begin('me')(failed(0))).toBe(false);
  });
});
