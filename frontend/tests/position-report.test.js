// The world never asks the transport for more than two position updates per second.
import {it,expect} from 'vitest';
import {createPositionReporter} from '../src/controls/presence-report.js';
const fixturePlace=()=>`fixture_${crypto.randomUUID().slice(0,8)}`;
function setup(){
  let now=0;const calls=[],place=fixturePlace();
  const reporter=createPositionReporter(value=>calls.push({at:now,value}));
  return {calls,reporter,sample:(x,moving=true,extra={})=>({place,x,y:10,facing:'right',moving,...extra}),
    update(value,at,options){now=at;reporter.update(value,now,options);}};
}

it('caps initial, moving and stop reports at two a second without an idle heartbeat',()=>{
  const {calls,sample,update}=setup();
  update(sample(0,false),0);
  for(let t=10;t<2010;t+=10)update(sample(t/1000),t);
  expect(calls.map(call=>call.at)).toEqual([0,500,1000,1500,2000]);
  update(sample(2,false),2010);update(sample(2,false),2510);update(sample(2,false),3010);
  expect(calls.map(call=>call.at)).toEqual([0,500,1000,1500,2000,2510]);
  expect(calls[0].value.moving).toBe(false);expect(calls.at(-1).value.moving).toBe(false);
  expect(calls.every((call,index)=>!index||call.at-calls[index-1].at>=500)).toBe(true);
});

it('queues the final stop under the same cap',()=>{
  const {calls,sample,update}=setup();
  update(sample(1),0);update(sample(1,false),100);expect(calls).toHaveLength(1);
  update(sample(1,false),500);update(sample(1,false),1000);
  expect(calls.map(call=>call.at)).toEqual([0,500]);expect(calls[1].value.moving).toBe(false);
});

it('sends a stationary captain once at normal startup, then stays silent while idle',()=>{
  const {calls,sample,update}=setup();const initial=sample(7,false,{facing:'front'});
  update(initial,0);
  for(const at of [500,1000,5000])update(initial,at);
  expect(calls).toEqual([{at:0,value:initial}]);
});

it('keeps disabled samples silent and sends only the fresh stationary sample after reconnecting',()=>{
  const {calls,sample,update}=setup(),nextPlace=fixturePlace();
  update(sample(0,false),0);
  update(sample(4,true,{place:nextPlace}),600,{enabled:false});
  update(sample(7,false,{place:nextPlace,facing:'left'}),900,{enabled:false});
  expect(calls).toHaveLength(1);
  const resumed=sample(9,false,{place:nextPlace,facing:'back'});
  update(resumed,1000);update(resumed,1500);update(resumed,2000);
  expect(calls).toHaveLength(2);expect(calls[1]).toEqual({at:1000,value:resumed});
});

it('preserves the last send time across rapid disable and enable toggles',()=>{
  const {calls,sample,update}=setup();
  update(sample(1,false),0);update(sample(2,false),100,{enabled:false});
  update(sample(3,false),200);update(sample(4,false),250,{enabled:false});
  update(sample(5,false),499);expect(calls).toHaveLength(1);
  update(sample(6,false),500);update(sample(7,false),600,{enabled:false});
  update(sample(8,false),999);expect(calls).toHaveLength(2);
  update(sample(9,false),1000);update(sample(9,false),1500);
  expect(calls.map(call=>call.at)).toEqual([0,500,1000]);
  expect(calls.map(call=>call.value.x)).toEqual([1,6,9]);
});

it('reports a stationary place change once at the allowance, using the latest local facing',()=>{
  const {calls,sample,update}=setup(),nextPlace=fixturePlace();
  update(sample(1,false,{facing:'front'}),0);
  update(sample(1,false,{place:nextPlace,facing:'right'}),100);
  update(sample(1,false,{place:nextPlace,facing:'back'}),499);expect(calls).toHaveLength(1);
  const arrived=sample(1,false,{place:nextPlace,facing:'left'});
  update(arrived,500);update(arrived,1000);
  expect(calls).toHaveLength(2);expect(calls[1]).toEqual({at:500,value:arrived});
});

it('keeps stationary facing changes local and reports changed facing while moving',()=>{
  const {calls,sample,update}=setup();
  update(sample(1,false,{facing:'front'}),0);
  update(sample(1,false,{facing:'right'}),500);expect(calls).toHaveLength(1);
  update(sample(1,true,{facing:'right'}),600);
  update(sample(1,true,{facing:'right'}),1100);expect(calls).toHaveLength(2);
  update(sample(1,true,{facing:'back'}),1200);
  expect(calls.map(call=>call.at)).toEqual([0,600,1200]);
  expect(calls.map(call=>call.value.facing)).toEqual(['front','right','back']);
});

it('does not establish an initial sample from non-finite coordinates or time',()=>{
  const {calls,sample,update}=setup();
  update(sample(NaN,false),0);update(sample(1,false,{y:Infinity}),100);update(sample(2,false),NaN);
  expect(calls).toEqual([]);const valid=sample(3,false);update(valid,500);
  expect(calls).toEqual([{at:500,value:valid}]);
});
