// Contract checks reject malformed or private islet display without adding a new adapter surface.
import {expect,it} from 'vitest';
import {validateIsletDisplay} from '../src/adapter/conformance/islet.js';

const station = {id:'islet_signal_station',name:'Recorded station',built:false,
  canBuild:true,buildLabel:'Build station',caption:'Recorded server price'};
const view = () => ({account:{state:'signed_in'},crew:{isletReminder:null},
  finale:{islet:{...station},isletFailure:null}});

it('accepts absent legacy fields, private empty fields and a supplied server station',()=>{
  validateIsletDisplay({account:{state:'signed_out'},crew:{},finale:{}});
  validateIsletDisplay({account:{state:'signed_out'},crew:{isletReminder:null},
    finale:{islet:null,isletFailure:null}});
  validateIsletDisplay(view());
  const supplied=view();supplied.crew.isletReminder={message:'Recorded reminder',actionLabel:'Open islet'};
  supplied.finale.isletFailure={reason:'rate_limited',message:'Recorded cooldown',status:429,
    retryAfterSeconds:3,retryUntil:3000.5};
  validateIsletDisplay(supplied);
});

it.each(['signed_out','signing_in','expired','error'])('rejects retained private station while account is %s',state=>{
  const supplied=view();supplied.account.state=state;
  expect(()=>validateIsletDisplay(supplied)).toThrow();
});

it.each([
  {built:'true'}, {canBuild:1}, {id:'unpublished-light'}, {actionUid:'forbidden-field'},
])('rejects a station outside the shared display contract: %j',change=>{
  const supplied=view();Object.assign(supplied.finale.islet,change);
  expect(()=>validateIsletDisplay(supplied)).toThrow();
});

it.each([
  {reason:'unknown_reason'}, {actionUid:'forbidden-field'}, {status:600},
  {retryAfterSeconds:0.5}, {retryAfterSeconds:86401}, {retryUntil:Infinity},
])('rejects unsafe failure metadata: %j',change=>{
  const supplied=view();supplied.finale.isletFailure={reason:'rate_limited',message:'Recorded refusal',...change};
  expect(()=>validateIsletDisplay(supplied)).toThrow();
});
