// A lazy arena load cannot recreate a panel after its game has been disposed.
import {beforeEach, describe, expect, it, vi} from 'vitest';
const fakes=vi.hoisted(()=>({choose:vi.fn(),panel:vi.fn()}));
vi.mock('../src/screens/duels/http-adapter.js',()=>({createHttpAdapter:fakes.choose}));
vi.mock('../src/screens/duels/panel.js',()=>({createPanel:fakes.panel}));
import {disposeArena,openArena} from '../src/screens/duels/index.js';
beforeEach(()=>{disposeArena();vi.clearAllMocks();vi.stubGlobal("location",{search:""});});
describe('arena owner lifetime',()=>{
  it('disposes an adapter that finishes loading after the game closes',async()=>{
    let finish;
    fakes.choose.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    const pending=openArena({});
    disposeArena();
    const adapter={dispose:vi.fn()};finish(adapter);
    await pending;
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(fakes.panel).not.toHaveBeenCalled();
  });
  it('lets a new game open while an old load is still pending',async()=>{
    let finish;
    fakes.choose.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    const old=openArena({});disposeArena();
    const adapter={dispose:vi.fn()},panel={open:vi.fn(),dispose:vi.fn(),isGone:()=>false};
    fakes.choose.mockReturnValueOnce(adapter);fakes.panel.mockReturnValueOnce(panel);
    await openArena({});
    finish({dispose:vi.fn()});await old;
    expect(panel.open).toHaveBeenCalledOnce();
    expect(fakes.panel).toHaveBeenCalledOnce();
    disposeArena();expect(panel.dispose).toHaveBeenCalledOnce();
  });
});

describe('festival duel handoff',()=>{
  it('forwards the server-provided duel id and awaits the existing detail panel',async()=>{
    const adapter={dispose:vi.fn()},panel={open:vi.fn(async id=>id),dispose:vi.fn(),isGone:()=>false};
    fakes.choose.mockReturnValueOnce(adapter);fakes.panel.mockReturnValueOnce(panel);
    await expect(openArena({duelId:'fixture-duel'})).resolves.toBe('fixture-duel');
    expect(panel.open).toHaveBeenCalledWith('fixture-duel');disposeArena();
  });
});
