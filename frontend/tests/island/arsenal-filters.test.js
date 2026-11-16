import {expect, it, vi} from 'vitest';
import {rackView, arsenalModel} from '../../src/island/arsenal-model.js';
import {createArsenal} from '../../src/island/arsenal.js';
const copy = (no,weapon='pistols',holder=null,you=false) => ({id:`copy-${no}`,no,weapon,holder,you,away:false});
const answer = copies => ({code:'ISLE-K7Q2M',capacity:20,stored:copies.filter(row=>!row.holder).length,copies,waveRunning:false,coins:1000});

it('20 stored copies and carried copies are counted separately, without losing ids', () => {
  const copies = [...Array.from({length:20},(_,i)=>copy(i+1)),copy(21,'long_rifle','me',true),copy(22,'pistols','mate')];
  expect(rackView(copies).counts).toEqual({all:22,available:20,carried:2});
  expect(rackView(copies,'available').copies.map(row=>row.id)).toEqual(copies.slice(0,20).map(row=>row.id));
  expect(rackView(copies,'carried').copies.map(row=>row.id)).toEqual(['copy-22','copy-21']);
  expect(arsenalModel({answer:answer(copies),filter:'carried'}).back.disabled).toBe(true); // Full-rack return rule remains.
});
it('weapon grouping and rack-number ordering are stable and do not mutate server data', () => {
  const copies = Object.freeze([Object.freeze(copy(3,'long_rifle')),Object.freeze(copy(4)),Object.freeze(copy(2))]);
  expect(rackView(copies).copies.map(row=>row.id)).toEqual(['copy-2','copy-4','copy-3']);
  expect(copies.map(row=>row.id)).toEqual(['copy-3','copy-4','copy-2']);
  const model = arsenalModel({answer:answer(copies)});
  expect(model.groups.map(group=>[group.name,group.rows.length])).toEqual([['Pistols',2],['Long rifle',1]]);
});
it.each(['all','available','carried'])('empty %s view has an explicit message', filter => {
  const view = arsenalModel({answer:answer([]),filter});
  expect(view.rack).toEqual([]);
  expect(view.groups).toEqual([]);
  expect(view.empty).toBeTruthy();
  expect(view.filters.find(item=>item.id===filter).selected).toBe(true);
});
it('unknown filters and malformed optional input fall back safely', () => {
  expect(rackView([copy(1)],'other').filter).toBe('all');
  expect(rackView(null).copies).toEqual([]);
});
it('wave and pending restrictions still disable every visible Take/Swap', () => {
  for (const flags of [{busy:'buy:pistols'},{answer:{...answer([copy(1)]),waveRunning:true}}]) {
    const model = arsenalModel({answer:answer([copy(1)]),filter:'available',...flags});
    expect(model.rack[0].button.disabled).toBe(true);
  }
});
it('filtering is local, persists across a read, and does not buy, take, return or reread', async () => {
  const api = {state:vi.fn(async()=>({ok:true,data:answer([copy(1),copy(2,'long_rifle','mate')])})),buy:vi.fn(),take:vi.fn(),giveBack:vi.fn()};
  const cards = [], ui = {open:'arsenal',arsenalCard:model=>cards.push(model)};
  const arsenal = createArsenal({api,ui,enabled:()=>true});
  await arsenal.refresh();
  arsenal.handlers.filter('carried'); arsenal.handlers.filter('carried'); arsenal.handlers.filter('bad');
  expect(api.state).toHaveBeenCalledOnce();
  for (const name of ['buy','take','giveBack']) expect(api[name]).not.toHaveBeenCalled();
  expect(cards.at(-1).rack.map(row=>row.id)).toEqual(['copy-2']);
  await arsenal.refresh();
  expect(cards.at(-1).filter).toBe('carried');
});
