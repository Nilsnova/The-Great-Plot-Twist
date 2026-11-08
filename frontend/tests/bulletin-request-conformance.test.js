// Public bulletin request metadata cannot expose private auth, save conflicts or raw response fields.
import {expect,it} from 'vitest';
import {validateBulletin} from '../src/adapter/conformance/bulletin.js';
const view=()=>({status:'unavailable',day:null,lines:[],weather:null,exchange:null,chapterTwoHook:null});
it('accepts legacy omissions and explicit empty request metadata',()=>{
  validateBulletin(view());validateBulletin({...view(),request:null});
});
it.each([[0,'offline'],[401,'internal_error'],[409,'internal_error'],[429,'rate_limited'],
  [502,'internal_error'],[503,'not_connected'],[404,'feature_off']])('accepts safe public %s metadata', (status,reason)=>{
  const bulletin={...view(),...(status===404?{status:'off'}:{}),request:{reason,message:'Recorded public read failure',status,
    ...(status===429?{retryUntil:3000.5}:{})}};
  validateBulletin(bulletin);
});
it.each([{reason:'session_expired'},{reason:'save_conflict'},{status:600},{status:1.5},
  {status:401,reason:'not_connected'},{status:409,reason:'offline'},{playerId:'forbidden'},
  {token:'forbidden'},{error:{message:'forbidden'}},{reason:'rate_limited',retryUntil:-1},
  {reason:'rate_limited',retryUntil:Infinity},
  {reason:'internal_error',retryUntil:3000}])('rejects unsafe public metadata %j', change=>{
  const bulletin={...view(),request:{reason:'internal_error',message:'Recorded refusal',...change}};
  expect(()=>validateBulletin(bulletin)).toThrow();
});
it('requires a bounded deadline for a rate limit and cleared data for feature-off',()=>{
  expect(()=>validateBulletin({...view(),request:{reason:'rate_limited',message:'Recorded limit'}})).toThrow();
  expect(()=>validateBulletin({...view(),status:'off',lines:[{kind:'notice',text:'Retained line'}],
    request:{reason:'feature_off',message:'Recorded closure',status:404}})).toThrow();
});
