// Signed out, the demo shows no endless "🪙 …" and no "Captain pending" (small demo polish).
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('hides the coin chip while signed out with no coins, and shows it once coins arrive',async()=>{
  const result=await evaluate(async()=>{
    const {createHud}=await window.g20Import('/src/ui/hud.js');const hud=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    const chip=()=>document.querySelector('.hud-coins');
    const before=chip().hidden;
    hud.setCaptain({account:{state:'signed_out'},captain:{name:'Captain pending',coins:null}});const signedOut=chip().hidden;
    hud.setCoinSource('island');hud.setCoins(100);const withCoins=[chip().hidden,chip().textContent];
    hud.dispose();
    const second=createHud(document.body,{focus(){},start(){},chart(){},quality(){}});
    second.setCaptain({account:{state:'signed_in'},captain:{name:'Nico',coins:null}});const signedInLoading=[chip().hidden,chip().textContent];
    second.dispose();return {before,signedOut,withCoins,signedInLoading};
  });
  expect(result).toEqual({before:false,signedOut:true,withCoins:[false,'🪙 100'],signedInLoading:[false,'🪙 …']});
});

it('says only "Signed out" in Settings and the account screen when there is no captain yet',async()=>{
  const result=await evaluate(async()=>{
    const {createAccountSummary}=await window.g20Import('/src/screens/account/summary.js');
    const {createAccountScreen}=await window.g20Import('/src/screens/account/index.js');
    const summary=createAccountSummary({send(){},openAccount(){}});document.body.append(summary.element);
    summary.update({account:{state:'signed_out',canSignIn:false}});const out=summary.element.querySelector('.account-summary-status').textContent;
    summary.update({account:{state:'signed_in',captainName:'Captain Nico',canSignIn:false}});const named=summary.element.querySelector('.account-summary-status').textContent;
    summary.dispose();
    const screen=createAccountScreen({send(){}});document.body.append(screen.element);screen.update?.({account:{state:'signed_out',canSignIn:false}});
    const screenText=screen.element.querySelector('.account-status')?.textContent;screen.dispose?.();
    return {out,named,screenText};
  });
  expect(result).toEqual({out:'Signed out',named:'Signed in, Captain Nico',screenText:'Signed out'});
});
