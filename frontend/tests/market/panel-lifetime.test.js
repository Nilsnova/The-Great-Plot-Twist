// Keep the real panel, market session and trade flow; replace only native modal/tab/layout boundaries.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createMarketPanel} from '../../src/screens/market/panel.js';
import {createFakeMarketAdapter} from '../../src/screens/market/fake.js';
const captured = vi.hoisted(() => ({}));
vi.mock('../../src/diagnostics/report-link.js',()=>({createProblemLink:()=>{const link=document.createElement('a');link.textContent='Report a problem';return link;}}));
vi.mock('../../src/ui/kit/modal.js', () => ({createModal: ({body, onClose}) => {
  const element = document.createElement('dialog'); element.open = false; element.append(body);
  const modal = {element, open(container) { container.append(element); element.open = true; },
    close() { element.open = false; onClose(); }, dispose: vi.fn(() => { element.open = false; onClose(); element.remove(); })};
  captured.modal = modal; return modal;
}}));
vi.mock('../../src/ui/kit/tabs.js', () => ({createTabs: () => ({element: document.createElement('div'), select() {}})}));
vi.mock('../../src/screens/market/poller.js', () => ({createPoller: () => ({start: vi.fn(), stop: vi.fn(), runNow: vi.fn()})}));
vi.mock('../../src/screens/market/board-view.js', () => ({createBoardView: options => {
  captured.openPosition = options.onOpenPosition;
  const view={element: document.createElement('div'), update: vi.fn(), reset: vi.fn()};captured.board=view;return view;
}}));
vi.mock('../../src/screens/market/positions-view.js', () => ({createPositionsView: options => {
  captured.closePosition = options.onClosePosition;
  const view = {element: document.createElement('div'), update: vi.fn(), reset: vi.fn(), dispose: vi.fn()};
  captured.positions = view; return view;
}}));
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.events = new Map(); this._text = ''; this.classList = {add() {}};this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.isConnected=true; }
  get textContent() { return this._text + this.children.map(child => child instanceof Element ? child.textContent : String(child)).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) { for (const child of children) { this.children.push(child); if (child instanceof Element) child.parent = child.parentElement = this; } }
  setAttribute(name,value) {this.attributes[name]=String(value);}
  removeAttribute(name) {delete this.attributes[name];}
  closest() {return this.tagName==='dialog'?this:this.parentElement?.closest()??null;}
  querySelector(selector) {return this.querySelectorAll('button').find(item=>selector==='[data-focus="retry-server-call"]'&&item.dataset.focus==='retry-server-call');}
  addEventListener(name, listener) { this.events.set(name, listener); }
  removeEventListener(name) { this.events.delete(name); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = this.parentElement = null;this.isConnected=false; }
  querySelectorAll(tag) { return this.children.flatMap(child => child instanceof Element ? [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)] : []); }
  fire(name) { return this.events.get(name)?.({target: this}); }
  focus() { document.activeElement = this; }
}
const panels = [], intent = {companyId: 'harbor-trust', side: 'rising', stake: 100};
const unknown = {ok: false, code: 'outcome_unknown', status: 0, message: '', retryAfterSeconds: null};
const button = label => captured.modal.element.querySelectorAll('button').find(item => item.textContent === label);
function setup({openShareholderRegister,onSignIn=vi.fn()} = {}) {
  const fake = createFakeMarketAdapter(), adapter = {board: vi.fn(fake.board), portfolio: vi.fn(fake.portfolio),
    open: vi.fn(fake.open), close: vi.fn(fake.close)};
  const panel = createMarketPanel({container: document.createElement('main'), adapter, openShareholderRegister, onSignIn,
    onSessionChange: listener => { captured.identity = listener; return vi.fn(); }});
  panels.push(panel); return {panel, adapter, onSignIn};
}
beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(0); for (const key of Object.keys(captured)) delete captured[key];
  vi.stubGlobal('document', {createElement: tag => new Element(tag), activeElement: null, hidden: false}); });
afterEach(() => { for (const panel of panels.splice(0)) panel.dispose();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('market panel request ownership', () => {
  it('guards held callbacks before sending after close or final disposal', async () => {
    const {panel, adapter} = setup(); panel.open(); const open = captured.openPosition, close = captured.closePosition;
    const heldSend = button('Send again').events.get('click'); panel.close();
    expect((await open(intent)).kind).toBe('expired'); expect((await close({positionId: crypto.randomUUID()})).kind).toBe('expired');
    expect(adapter.open).not.toHaveBeenCalled(); expect(adapter.close).not.toHaveBeenCalled();
    panel.dispose(); panel.dispose(); await heldSend({}); await open(intent); panel.open();
    expect(panel.active).toBe(false); expect(adapter.open).not.toHaveBeenCalled(); expect(captured.positions.dispose).toHaveBeenCalledOnce();
  });

  it('retains one unknown body and uid across ordinary close and verifies a current read before explicit resend', async () => {
    const {panel, adapter} = setup(); adapter.open.mockResolvedValueOnce(unknown).mockResolvedValueOnce({ok: false, code: 'already_applied', status: 409});
    panel.open(); const first = await captured.openPosition(intent); await first.refreshed;
    const held = adapter.open.mock.calls[0]; panel.close(); panel.open();
    await button('Send again').fire('click');
    expect(adapter.open).toHaveBeenCalledTimes(2); expect(adapter.open.mock.calls[1]).toEqual(held);
    expect(adapter.portfolio.mock.invocationCallOrder.at(-1)).toBeGreaterThan(adapter.open.mock.invocationCallOrder[1]);
    expect(adapter.portfolio.mock.invocationCallOrder.some(order => order > adapter.open.mock.invocationCallOrder[0]
      && order < adapter.open.mock.invocationCallOrder[1])).toBe(true);
    expect(captured.positions.dispose).not.toHaveBeenCalled();
  });

  it('clears unknown ids at an account boundary while the anonymous panel remains reusable', async () => {
    const {panel, adapter} = setup(); adapter.open.mockResolvedValue(unknown); panel.open();
    await (await captured.openPosition(intent)).refreshed; const uid = adapter.open.mock.calls[0][1].uid;
    captured.identity({signedIn: false}); await button('Send again').fire('click');
    expect(adapter.open).toHaveBeenCalledTimes(1); expect(panel.active).toBe(true);
    captured.identity({signedIn: true}); await captured.openPosition({...intent, side: 'falling'});
    expect(adapter.open).toHaveBeenCalledTimes(2); expect(adapter.open.mock.calls[1][1].uid).not.toBe(uid);
    expect(adapter.open.mock.calls[1][0].side).toBe('falling');
  });

  it('hides and guards Forget when a newer manual check failed, retaining the original trade uid', async () => {
    const {panel, adapter} = setup(); adapter.open.mockResolvedValue(unknown); panel.open();
    await (await captured.openPosition(intent)).refreshed;
    const original=adapter.open.mock.calls[0],forget=button('Forget this trade');
    await button('Check again').fire('click'); expect(forget.parent.hidden).toBe(false);
    adapter.portfolio.mockResolvedValueOnce({ok:false,code:'database_unavailable',status:503});
    await button('Check again').fire('click');
    expect(forget.parent.hidden).toBe(true);expect(captured.modal.element.textContent).not.toContain('Updated your positions.');
    await forget.fire('click');await (await button('Send again').fire('click')).refreshed;
    expect(adapter.open).toHaveBeenCalledTimes(2);expect(adapter.open.mock.calls[1]).toEqual(original);
  });

  it('mounts one genuine common call and keeps its Retry and original control state on the exact server deadline', async () => {
    const {panel,adapter}=setup();panel.open();adapter.open.mockResolvedValueOnce({ok:false,status:429,code:'too_many_requests',retryAfterSeconds:3});
    await captured.openPosition(intent);
    const status=captured.modal.element.querySelectorAll('p').find(item=>item.className==='market-status');expect(document.activeElement).toBe(status);
    const call=captured.modal.element.querySelectorAll('div').filter(item=>item.className==='server-call');expect(call).toHaveLength(1);
    const retry=button('Retry trade');expect(retry.disabled).toBe(true);expect(captured.board.update.mock.lastCall[2].disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);panel.close();panel.open();expect(retry.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);expect(captured.board.update.mock.lastCall[2].disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1);expect(retry.disabled).toBe(false);expect(captured.board.update.mock.lastCall[2].disabled).toBe(false);expect(adapter.open).toHaveBeenCalledOnce();
  });

  it('forwards common sign-in navigation and revokes a previous Forget after a refused explicit resend',async()=>{
    const {panel,adapter,onSignIn}=setup();panel.open();adapter.open.mockResolvedValueOnce({ok:false,status:401,code:'unauthorized'});
    await captured.openPosition(intent);button('Sign in again').onclick();expect(onSignIn).toHaveBeenCalledOnce();
    adapter.open.mockResolvedValueOnce(unknown).mockResolvedValueOnce({ok:false,status:403,code:'forbidden'});
    await (await captured.openPosition(intent)).refreshed;const original=adapter.open.mock.calls[1];
    await button('Check again').fire('click');const forget=button('Forget this trade');expect(forget.parent.hidden).toBe(false);
    await button('Send again').fire('click');expect(forget.parent.hidden).toBe(true);await forget.fire('click');
    await button('Check again').fire('click');expect(forget.parent.hidden).toBe(false);
    expect(adapter.open.mock.calls[2]).toEqual(original);
  });

  it('does not navigate through a retained shareholder-register listener after close or disposal', async () => {
    const navigate=vi.fn(),{panel}=setup({openShareholderRegister:navigate});panel.open();
    const register=button('Read the shareholder register'),retained=register.events.get('click');
    panel.close();await retained({});expect(navigate).not.toHaveBeenCalled();
    panel.open();await register.fire('click');expect(navigate).toHaveBeenCalledOnce();
    panel.open();panel.dispose();await retained({});await register.fire('click');
    expect(navigate).toHaveBeenCalledOnce();expect(register.events.has('click')).toBe(false);
  });
});
