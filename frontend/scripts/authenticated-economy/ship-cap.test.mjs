// Source-qualified evidence permits unrelated test commits while refusing changed measured inputs.
import assert from 'node:assert/strict';
import test from 'node:test';
import {sameSourceScope} from './ship-cap.mjs';

const source=()=>({services:[{actualCheckoutHead:'first-test-head',expectedProductionBaseline:'reviewed-candidate',
 productionDiffFromBaseline:'empty',paths:['backend/server','frontend/src']}],
 worker:{actualCheckoutHead:'first-test-head',expectedProductionBaseline:'reviewed-candidate'}});

test('an unrelated test commit does not change the protected source claim',()=>{
 const before=source(),after=source();after.services[0].actualCheckoutHead='new-test-head';after.worker.actualCheckoutHead='new-test-head';
 assert.equal(sameSourceScope(before,after),true);
});
for(const [name,change] of [
 ['a different production candidate',row=>{row.services[0].expectedProductionBaseline='other-candidate';}],
 ['a missing protected source scope',row=>{row.services[0].paths=[];}],
 ['changed production-diff evidence',row=>{row.services[0].productionDiffFromBaseline='changed';}],
])test(name+' cannot inherit the old evidence',()=>{
 const before=source(),after=source();change(after);assert.equal(sameSourceScope(before,after),false);
});
