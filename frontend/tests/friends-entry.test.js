// Friends navigation follows actual account facts without granting story completion or a crew.
import {expect,it} from 'vitest';
import {friendsPlan} from '../src/shell/friends-logic.js';
it('asks for an explicit account visit when sign-in is available',()=>{
  expect(friendsPlan({state:'signed_out',canSignIn:true})).toMatchObject({action:'account',label:'Account and saves'});
  expect(friendsPlan({state:'expired',canSignIn:true})).toMatchObject({action:'account'});
  expect(friendsPlan({state:'expired',canSignIn:true,connection:{state:'expired'}})).toMatchObject({action:'account'});
  expect(friendsPlan({state:'signed_out',canSignIn:false})).toMatchObject({action:'story',resume:false});
});
it('starts or resumes the real story until a kit is confirmed',()=>{
  const account={state:'signed_in',hasKit:false};
  expect(friendsPlan(account)).toMatchObject({action:'story',resume:false,label:'Start your story'});
  expect(friendsPlan(account,true)).toMatchObject({action:'story',resume:true,label:'Continue your story'});
  expect(friendsPlan({...account,canContinue:true})).toMatchObject({action:'story',resume:true});
});
it('opens the crew only for the confirmed signed-in account',()=>{
  expect(friendsPlan({state:'signed_in',hasKit:true})).toMatchObject({action:'crew',resume:true});
  for(const account of [null,{}, {state:'signed_in'}, {state:'signed_out',hasKit:true,canSignIn:false}]){
    expect(friendsPlan(account).action).not.toBe('crew');
  }
});
it('keeps offline and disabled entry honest without pretending a crew is ready',()=>{
  expect(friendsPlan({state:'signed_in',hasKit:true,connection:{state:'offline'}},true))
    .toMatchObject({action:'story',resume:false,label:'Start a new story'});
  expect(friendsPlan({state:'signed_out',canSignIn:false,signInMessage:'Sign-in opens later.'},true))
    .toMatchObject({action:'story',resume:true,body:'Online crews are unavailable. You can explore solo.'});
});
