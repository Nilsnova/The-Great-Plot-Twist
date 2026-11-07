// Account resets clear local islet presentation without inventing accepted server events or replay actions.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {on,emit} from '../src/core/events.js';
import {createIsletState} from '../src/world/islet/state.js';

const cleanups=[],stores=[];
function setup(){
  const publicChanges=vi.fn(),raised=vi.fn();
  cleanups.push(on('islet_changed',publicChanges),on('islet_build_raised',raised));
  let late;
  const unsubscribe=vi.fn();
  const store=createIsletState({on(type,listener){late=listener;const stop=on(type,listener);
    return ()=>{unsubscribe();stop();};}});
  stores.push(store);return {store,publicChanges,raised,unsubscribe,late:event=>late(event)};
}
const accepted=built=>({type:'islet_changed',built,signalStationBuilt:built.includes('islet_signal_station')});
afterEach(()=>{for(const store of stores.splice(0))store.dispose();for(const stop of cleanups.splice(0))stop();});

describe('home-islet account reset',()=>{
  it('drops the previous actual buildings and preview through local subscriptions only',()=>{
    const f=setup(),actual=[],rendered=[];
    f.store.subscribeActual(built=>actual.push(built));
    f.store.subscribe((built,meta)=>rendered.push({built,meta}));
    emit(accepted(['plot_1','plot_2','islet_signal_station']));
    f.store.previewBuilt(['plot_1','plot_3','islet_signal_station']);
    const actualBefore=actual.length,renderedBefore=rendered.length;
    expect(f.store.resetAccount()).toBe(true);
    expect(f.store.getLatestBuilt()).toEqual(['plot_1']);expect(f.store.getBuilt()).toEqual(['plot_1']);
    expect(actual).toHaveLength(actualBefore+1);expect(actual.at(-1)).toEqual(['plot_1']);
    expect(rendered).toHaveLength(renderedBefore+1);
    expect(rendered.at(-1)).toEqual({built:['plot_1'],meta:{preview:false}});
    expect(f.publicChanges).toHaveBeenCalledOnce();expect(f.raised).not.toHaveBeenCalled();
    f.store.clearPreview();expect(f.store.resetAccount()).toBe(false);
    expect(actual).toHaveLength(actualBefore+1);expect(rendered).toHaveLength(renderedBefore+1);
  });

  it('clears preview metadata without needlessly notifying unchanged actual state',()=>{
    const f=setup(),actual=vi.fn(),rendered=vi.fn();
    f.store.subscribeActual(actual);f.store.subscribe(rendered);
    expect(f.store.resetAccount()).toBe(false);
    expect(f.store.previewBuilt(['plot_1'])).toBe(true);
    expect(rendered).toHaveBeenLastCalledWith(['plot_1'],{preview:true});
    expect(f.store.resetAccount()).toBe(true);
    expect(rendered).toHaveBeenLastCalledWith(['plot_1'],{preview:false});
    expect(actual).toHaveBeenCalledOnce();expect(f.store.resetAccount()).toBe(false);
    expect(rendered).toHaveBeenCalledTimes(3);
    expect(f.publicChanges).not.toHaveBeenCalled();expect(f.raised).not.toHaveBeenCalled();
  });

  it('gives chart, world and actual consumers independent cabin snapshots',()=>{
    const f=setup(),chart=vi.fn(),actual=vi.fn();
    f.store.subscribe(built=>{built.length=0;});f.store.subscribe(chart);
    f.store.subscribeActual(built=>{built.push('plot_4');});f.store.subscribeActual(actual);
    emit(accepted(['plot_1','islet_signal_station']));f.store.resetAccount();
    expect(chart).toHaveBeenLastCalledWith(['plot_1'],{preview:false});
    expect(actual).toHaveBeenLastCalledWith(['plot_1']);
    const read=f.store.getBuilt();read.push('plot_2');
    expect(f.store.getBuilt()).toEqual(['plot_1']);expect(f.store.getLatestBuilt()).toEqual(['plot_1']);
  });

  it('keeps reset state through invalid late data and accepts the next legitimate snapshot',()=>{
    const f=setup();emit(accepted(['plot_1','islet_signal_station']));
    f.store.previewBuilt(['plot_1','plot_3']);f.store.resetAccount();
    emit({type:'islet_changed',built:['plot_1','islet_signal_station'],signalStationBuilt:false});
    f.store.clearPreview();
    expect(f.store.getBuilt()).toEqual(['plot_1']);expect(f.store.getLatestBuilt()).toEqual(['plot_1']);
    emit(accepted(['plot_1','plot_2']));
    expect(f.store.getBuilt()).toEqual(['plot_1','plot_2']);
    expect(f.store.getLatestBuilt()).toEqual(['plot_1','plot_2']);
  });

  it('makes a repeating reset from an actual subscriber a no-op',()=>{
    const f=setup(),nested=[],rendered=vi.fn();let reenter=false;
    f.store.subscribeActual(()=>{if(reenter)nested.push(f.store.resetAccount());});
    f.store.subscribe(rendered);emit(accepted(['plot_1','plot_2']));
    const before=rendered.mock.calls.length;reenter=true;
    expect(f.store.resetAccount()).toBe(true);expect(nested).toEqual([false]);
    expect(rendered).toHaveBeenCalledTimes(before+1);expect(f.store.getBuilt()).toEqual(['plot_1']);
  });

  it('keeps disposal idempotent and ignores reset or retained callbacks afterward',()=>{
    const f=setup(),rendered=vi.fn(),actual=vi.fn();
    f.store.subscribe(rendered);f.store.subscribeActual(actual);
    emit(accepted(['plot_1','plot_2']));f.store.previewBuilt(['plot_1','plot_3']);
    const built=f.store.getBuilt(),latest=f.store.getLatestBuilt();
    const renderCalls=rendered.mock.calls.length,actualCalls=actual.mock.calls.length;
    f.store.dispose();f.store.dispose();expect(f.store.resetAccount()).toBe(false);
    f.late(accepted(['plot_1','islet_signal_station']));f.store.clearPreview();
    expect(f.store.getBuilt()).toEqual(built);expect(f.store.getLatestBuilt()).toEqual(latest);
    expect(rendered).toHaveBeenCalledTimes(renderCalls);expect(actual).toHaveBeenCalledTimes(actualCalls);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
});
