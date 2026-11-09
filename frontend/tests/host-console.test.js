// Host console permissions and retry identity, with fake API/view and no browser or network.
import { expect, it, vi } from 'vitest';
import { createHostController } from '../src/host/controller.js';
import { createHostApi } from '../src/host/api.js';
import { createSession } from '../src/online/session.js';
import { takeCallback, finishHostLogin } from '../src/host/auth.js';

const ok = data => ({ ok:true, status:200, data });
const overview = { players:12, caseClockAvailable:false };
const crews = { crews:[{ id:'crew-1', code:'K7QF2M', canClose:true }], total:1, limit:50 };
function setup() {
  const api = { get:vi.fn(path => Promise.resolve(ok(path.endsWith('overview') ? overview : crews))),
    post:vi.fn(() => Promise.resolve(ok({ status:'closed' }))), headerChecks:() => ({ noStore:true }) };
  const view = { hide:vi.fn(), show:vi.fn(), say:vi.fn(), busy:vi.fn() };
  let uid=0;
  return { api, view, controller:createHostController({ api, view, newUid:() => `action-${++uid}` }) };
}
it('asks the server before displaying any host panels', async () => {
  const {api,view,controller} = setup();
  api.get.mockResolvedValue({ok:false,status:403});
  await controller.refresh();
  expect(view.show).not.toHaveBeenCalled();
  expect(view.say).toHaveBeenLastCalledWith('Not a host');
  expect(api.get).toHaveBeenCalledTimes(1);
  await controller.closeCrew('crew-1',true);
  expect(api.post).not.toHaveBeenCalled();
});
it('displays overview and crews only after both checks pass', async () => {
  const {view,controller} = setup();
  await controller.refresh();
  expect(view.show).toHaveBeenCalledWith(overview,crews,{noStore:true},null);
});
it('does not close without confirmation or when the server marks a crew ineligible', async () => {
  const {api,controller} = setup();
  await controller.refresh();
  await controller.closeCrew('crew-1',false);
  await controller.closeCrew('another-crew',true);
  expect(api.post).not.toHaveBeenCalled();
});
it('reuses the action UUID on retry after an unknown network outcome', async () => {
  const {api,controller} = setup();
  api.post.mockResolvedValueOnce({ok:false,status:0});
  await controller.refresh();
  await controller.closeCrew('crew-1',true);
  await controller.closeCrew('crew-1',true);
  expect(api.post.mock.calls).toEqual([
    ['/api/host/crews/crew-1/close',{actionUid:'action-1'}],
    ['/api/host/crews/crew-1/close',{actionUid:'action-1'}],
  ]);
});
it('a sign out while a response is pending cannot restore host data', async () => {
  const {api,view,controller} = setup();
  let resolve;
  api.get.mockImplementation(() => new Promise(done => { resolve=done; }));
  const refresh=controller.refresh();
  controller.lock();
  resolve(ok(overview));
  await refresh;
  expect(view.show).not.toHaveBeenCalled();
});
it('removes old panels if refresh fails and refuses pending writes', async () => {
  const {api,view,controller} = setup();
  await controller.refresh();
  api.get.mockResolvedValue({ok:false,status:503});
  await controller.refresh();
  expect(view.hide.mock.invocationCallOrder.at(-1)).toBeGreaterThan(view.show.mock.invocationCallOrder.at(-1));
  await controller.closeCrew('crew-1',true);
  expect(api.post).not.toHaveBeenCalled();
});
it('hides the future clock and never posts it before capability and host checks', async () => {
  const {api,controller} = setup();
  await controller.refresh();
  await controller.setClock({action:'pause'});
  expect(api.post).not.toHaveBeenCalled();
});
it('uses same-origin authenticated API calls and checks private response headers', async () => {
  const session=createSession();session.setToken('test-only-memory-token');
  const fetchImpl=vi.fn(async () => new Response('{}', {headers:{'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}));
  const api=createHostApi({session,fetchImpl});
  await api.get('/api/host/overview');
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only-memory-token');
  expect(api.headerChecks()).toEqual({noStore:true,nosniff:true,noReferrer:true});
  expect(() => api.get('https://elsewhere.invalid/')).toThrow();
  api.resetHeaders();expect(api.headerChecks().noStore).toBe(false);
});
function enableClock(api) {
  api.get.mockImplementation(path=>Promise.resolve(ok(path.endsWith('overview')?overview:
    path.endsWith('config')?{capabilities:{hostCaseClock:true}}:crews)));
}
it('uses G10 seconds contract and never renders the returned case view', async () => {
  const {api,view,controller}=setup();enableClock(api);
  api.post.mockResolvedValue(ok({accepted:true,reason:null,message:'Clock moved.',now:2725,
    case:{solution:'private-test-case-view'}}));
  await controller.refresh();
  for(const bad of [0,3601,1.5,'600',NaN])await controller.setClock(bad);
  expect(api.post).not.toHaveBeenCalled();
  await controller.setClock(600);
  expect(api.post).toHaveBeenCalledWith('/api/host/case/clock',{seconds:600,actionUid:'action-1'});
  expect(view.say).toHaveBeenLastCalledWith('Clock moved: Clock moved. Case second 2725.');
  expect(JSON.stringify(view.say.mock.calls)).not.toContain('private-test-case-view');
});
it('retains a clock intent through unknown outcomes and prevents changing seconds on retry', async () => {
  const {api,controller}=setup();enableClock(api);
  api.post.mockResolvedValue({ok:false,status:0});
  await controller.refresh();await controller.setClock(60);await controller.setClock(300);
  await controller.setClock(60);
  expect(api.post.mock.calls).toEqual([
    ['/api/host/case/clock',{seconds:60,actionUid:'action-1'}],
    ['/api/host/case/clock',{seconds:60,actionUid:'action-1'}],
  ]);
});
it('retains clock retry identity after an unreadable successful response', async () => {
  const {api,view,controller}=setup();enableClock(api);
  api.post.mockResolvedValueOnce(ok(null)).mockResolvedValueOnce(ok({accepted:true,message:'Moved.',now:60,repeat:true}));
  await controller.refresh();await controller.setClock(60);await controller.setClock(60);
  expect(api.post.mock.calls[0]).toEqual(api.post.mock.calls[1]);
  expect(view.say).toHaveBeenLastCalledWith('Clock moved: Moved. Case second 60. (repeat)');
});
it('resolves an actual G10 repeat without extra numbers and permits the next clock move', async () => {
  const {api,view,controller}=setup();enableClock(api);
  api.post.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce(ok({
    accepted:true,reason:null,repeat:true,message:'The case clock moved forward.',
    case:{now:60,solution:'private-test-case-view'},
  })).mockResolvedValueOnce(ok({accepted:true,message:'Moved.',now:360}));
  await controller.refresh();await controller.setClock(60);await controller.setClock(60);
  expect(api.post.mock.calls[0]).toEqual(api.post.mock.calls[1]);
  expect(view.say).toHaveBeenLastCalledWith('Clock moved: The case clock moved forward. (repeat)');
  await controller.setClock(300);
  expect(api.post.mock.calls[2][1].seconds).toBe(300);
  expect(JSON.stringify(view.say.mock.calls)).not.toContain('private-test-case-view');
});
it('does not lose an uncertain clock UUID when the retry is rate-limited', async () => {
  const {api,controller}=setup();enableClock(api);
  const original=api.post;
  original.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce({ok:false,status:429})
    .mockResolvedValueOnce(ok({accepted:true,message:'Moved.',now:60,repeat:true}));
  await controller.refresh();
  await controller.setClock(60);await controller.setClock(60);await controller.setClock(60);
  expect(original.mock.calls.map(([,body])=>body.actionUid)).toEqual(['action-1','action-1','action-1']);
});
it('retains uncertain writes through a temporary failed refresh', async () => {
  const {api,controller}=setup();enableClock(api);
  api.post.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce(ok({accepted:true,message:'Moved.',now:60,repeat:true}));
  await controller.refresh();await controller.setClock(60);
  api.get.mockResolvedValueOnce({ok:false,status:503});await controller.refresh();
  enableClock(api);await controller.refresh();await controller.setClock(60);
  expect(api.post.mock.calls[0]).toEqual(api.post.mock.calls[1]);
});
it('does not invalidate an in-flight write with a refresh', async () => {
  const {api,view,controller}=setup();enableClock(api);await controller.refresh();
  let done;api.post.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
  const clock=controller.setClock(60),reads=api.get.mock.calls.length;
  await controller.refresh();expect(api.get).toHaveBeenCalledTimes(reads);
  expect(view.say).toHaveBeenLastCalledWith('Wait for the current action before refreshing.');
  done(ok({accepted:true,message:'Moved.',now:60}));await clock;
  expect(view.say).toHaveBeenLastCalledWith('Clock moved: Moved. Case second 60.');
});
it('shows game-rule refusal and rate-limit messages without rendering case data', async () => {
  const {api,view,controller}=setup();enableClock(api);await controller.refresh();
  api.post.mockResolvedValueOnce(ok({accepted:false,message:'Crew is finished.',reason:'finished',case:{}}));
  await controller.setClock(60);expect(view.say).toHaveBeenLastCalledWith('Clock not moved: Crew is finished.');
  api.post.mockResolvedValueOnce({ok:false,status:429});
  await controller.setClock(300);expect(view.say).toHaveBeenLastCalledWith('Clock rate limit reached. Wait before trying again.');
});
it('removes OAuth query and fragment before exchanging the one-time code', async () => {
  const history={replaceState:vi.fn()};
  const result=takeCallback({search:'?code=test-once',hash:'#ignored=fragment',pathname:'/host.html'},history);
  expect(result).toEqual({code:'test-once',failed:false});
  expect(history.replaceState).toHaveBeenCalledWith(null,'','/host.html');
  const storage={getItem:vi.fn(()=> 'test-only-verifier'),removeItem:vi.fn()},session=createSession();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({accessToken:'test-only-memory'}),{status:200})));
  try {
    expect(await finishHostLogin(result,session,storage)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith('host-console-pkce');
    expect(session.isSignedIn()).toBe(true);
    expect(storage).not.toHaveProperty('setItem');
  } finally {vi.unstubAllGlobals();}
});

// Class demo panel (G29): window status, open/close, guest clean-up.
import { demoSummary, demoPanel } from '../src/host/panels.js';
function enableDemo(api,demo={flagOn:true,open:false,openUntil:null}) {
  api.get.mockImplementation(path=>Promise.resolve(ok(path.endsWith('overview')?overview:
    path.endsWith('/demo')?demo:path.endsWith('config')?{capabilities:{}}:crews)));
}
it('reads the demo window on refresh and passes it to the view; an unreadable one shows as unknown', async () => {
  const {api,view,controller}=setup();enableDemo(api);
  await controller.refresh();
  expect(api.get).toHaveBeenCalledWith('/api/host/demo');
  expect(view.show.mock.calls.at(-1)[3]).toEqual({flagOn:true,open:false,openUntil:null});
  api.get.mockImplementation(path=>Promise.resolve(path.endsWith('/demo')?{ok:false,status:503}:ok(path.endsWith('overview')?overview:crews)));
  await controller.refresh();
  expect(view.show.mock.calls.at(-1)[3]).toBeNull();
});
it('opens for 2 hours and closes with hours 0, one action id per attempt', async () => {
  const {api,view,controller}=setup();enableDemo(api);view.demoBusy=vi.fn();view.demoUpdate=vi.fn();
  await controller.refresh();
  api.post.mockResolvedValueOnce(ok({flagOn:true,open:true,openUntil:'2026-11-09T15:00:00Z',repeat:false}));
  await controller.setDemo(2);
  expect(api.post).toHaveBeenLastCalledWith('/api/host/demo',{hours:2,actionUid:'action-1'});
  expect(view.demoUpdate).toHaveBeenLastCalledWith({flagOn:true,open:true,openUntil:'2026-11-09T15:00:00Z'});
  expect(view.demoBusy.mock.calls).toEqual([[true],[false]]);
  api.post.mockResolvedValueOnce(ok({flagOn:true,open:false,openUntil:null,repeat:false}));
  await controller.setDemo(0);
  expect(api.post).toHaveBeenLastCalledWith('/api/host/demo',{hours:0,actionUid:'action-2'});
  expect(view.say).toHaveBeenLastCalledWith('Demo window closed. Guests are refused now.');
  for(const bad of [-1,7,1.5,'2'])await controller.setDemo(bad);
  expect(api.post).toHaveBeenCalledTimes(2);
});
it('keeps the demo action id after an unknown outcome and refuses a different change meanwhile', async () => {
  const {api,view,controller}=setup();enableDemo(api);
  api.post.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce(ok({flagOn:true,open:true,openUntil:'2026-11-09T15:00:00Z',repeat:true}));
  await controller.refresh();
  await controller.setDemo(2);
  expect(view.say).toHaveBeenLastCalledWith('Demo outcome unknown. Press the same button again; the action ID is retained.');
  await controller.setDemo(0);
  expect(api.post).toHaveBeenCalledTimes(1);
  await controller.setDemo(2);
  expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
});
it('shows the server message for a refused demo change and locks on 403', async () => {
  const {api,view,controller}=setup();enableDemo(api);await controller.refresh();
  api.post.mockResolvedValueOnce({ok:false,status:422,message:'Hours must be 0 to 6.'});
  await controller.setDemo(2);
  expect(view.say).toHaveBeenLastCalledWith('Hours must be 0 to 6.');
  api.post.mockResolvedValueOnce({ok:false,status:403});
  await controller.setDemo(2);
  expect(view.say).toHaveBeenLastCalledWith('Not a host');
});
it('cleans up guests only after confirmation and reports the count', async () => {
  const {api,view,controller}=setup();enableDemo(api);view.demoUpdate=vi.fn();
  await controller.refresh();
  await controller.cleanupGuests(false);
  expect(api.post).not.toHaveBeenCalled();
  api.post.mockResolvedValueOnce(ok({checked:57,deleted:41,more:true}));
  await controller.cleanupGuests(true);
  expect(api.post).toHaveBeenCalledWith('/api/host/demo/cleanup',{actionUid:'action-1'});
  expect(view.say).toHaveBeenLastCalledWith('Removed 41 guest accounts (checked 57). More old guests remain. Run it again.');
  api.post.mockResolvedValueOnce(ok({checked:3,deleted:1,more:false}));
  await controller.cleanupGuests(true);
  expect(view.say).toHaveBeenLastCalledWith('Removed 1 guest account (checked 3).');
  expect(api.post.mock.calls[1][1].actionUid).toBe('action-2');
});
it('repeats an uncertain clean-up with the same id and shows server errors', async () => {
  const {api,view,controller}=setup();enableDemo(api);await controller.refresh();
  api.post.mockResolvedValueOnce({ok:false,status:503}).mockResolvedValueOnce({ok:false,status:502,message:'The database could not be reached.'});
  await controller.cleanupGuests(true);
  expect(view.say).toHaveBeenLastCalledWith('Clean-up outcome unknown. Press it again; the action ID is retained.');
  await controller.cleanupGuests(true);
  expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
});
// A very small injected DOM: enough for the kit panel, buttons, a checkbox and text.
class FakeNode {
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.own='';this.disabled=false;this.checked=false;
    this.classList={add:()=>{}};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  removeEventListener(){}
  remove(){}
  fire(type){for(const fn of this.listeners[type]??[])fn({});}
  click(){if(!this.disabled)this.fire('click');}
  set textContent(value){this.own=String(value);this.children=[];}
  get textContent(){return this.own+this.children.map(c=>c.textContent).join('');}
  find(tag,out=[]){if(this.tagName===tag)out.push(this);for(const c of this.children)c.find?.(tag,out);return out;}
}
it('summarises the demo window and builds an accessible panel with disabled-while-busy buttons', () => {
  vi.stubGlobal('document',{createElement:tag=>new FakeNode(tag),createTextNode:text=>{const n=new FakeNode('#text');n.own=text;return n;}});
  vi.stubGlobal('Node',FakeNode);
  try {
    expect(demoSummary(null).flag).toBe('Unknown');
    expect(demoSummary({flagOn:true,open:false,openUntil:null})).toEqual({flag:'On',window:'Closed'});
    expect(demoSummary({flagOn:false,open:false,openUntil:null}).flag).toContain('Off');
    expect(demoSummary({flagOn:true,open:true,openUntil:'2026-11-09T15:05:00Z'},'en-GB').window).toMatch(/^Open until \d\d:\d\d$/);
    const handlers={setDemo:vi.fn(),cleanup:vi.fn()};
    const ui=demoPanel({flagOn:true,open:false,openUntil:null},handlers);
    const buttons=ui.element.find('button');
    expect(buttons.map(b=>b.textContent)).toEqual(['Open for 2 hours','Close now','Clean up guests']);
    expect(ui.element.attributes['aria-labelledby']).toBeTruthy();
    expect(buttons[2].disabled).toBe(true);
    buttons[0].click();buttons[1].click();
    expect(handlers.setDemo.mock.calls).toEqual([[2],[0]]);
    const [box]=ui.element.find('input');
    box.checked=true;box.fire('change');
    expect(buttons[2].disabled).toBe(false);
    buttons[2].click();expect(handlers.cleanup).toHaveBeenCalledWith(true);
    ui.busy(true);expect(buttons.every(b=>b.disabled)).toBe(true);
    buttons[0].click();expect(handlers.setDemo).toHaveBeenCalledTimes(2);
    ui.busy(false);expect(buttons[0].disabled).toBe(false);expect(buttons[2].disabled).toBe(false);
    ui.update({flagOn:true,open:true,openUntil:'2026-11-09T15:05:00Z'});
    expect(ui.element.textContent).toContain('Open until');
    ui.reset();expect(box.checked).toBe(false);expect(buttons[2].disabled).toBe(true);
  } finally {vi.unstubAllGlobals();}
});
