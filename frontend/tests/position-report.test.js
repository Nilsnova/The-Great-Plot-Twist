// The world never asks the transport for more than two position updates per second.
import {it,expect} from 'vitest';
import {createPositionReporter} from '../src/controls/presence-report.js';
const sample=(x,moving=true,place='lighthouse_isle')=>({place,x,y:10,facing:'right',moving});
it('caps moving reports at two a second and sends no repeated idle samples',()=>{
  const calls=[],r=createPositionReporter(value=>calls.push(value));
  r.update(sample(0,false),0);
  for(let t=10;t<2010;t+=10)r.update(sample(t/1000),t);
  expect(calls).toHaveLength(4);
  r.update(sample(2,false),2010);r.update(sample(2,false),2510);r.update(sample(2,false),3010);
  expect(calls).toHaveLength(5);expect(calls.at(-1).moving).toBe(false);
});
it('queues the last stop under the same cap',()=>{
  const calls=[],r=createPositionReporter(value=>calls.push(value));
  r.update(sample(1),0);r.update(sample(1,false),100);expect(calls).toHaveLength(1);
  r.update(sample(1,false),500);expect(calls).toHaveLength(2);
});
it('keeps a resumed tour baseline silent until movement or a later place change',()=>{
  const calls=[],r=createPositionReporter(value=>calls.push(value));
  r.update(sample(0,false),0);r.update(sample(4,true,'saltreach_harbor'),600,{enabled:false});
  r.update(sample(0,false),900,{enabled:false});r.update(sample(0,false),1000);
  expect(calls).toHaveLength(0);r.update(sample(1),1100);expect(calls).toHaveLength(1);
});
