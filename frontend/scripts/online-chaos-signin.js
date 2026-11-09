// A restored SDK session can remove the sign-in control between a snapshot and a gesture.
import {openSettingsAccount} from './online-browser-actions.js';
export async function signInFromTitle({page,url}){
  await page.goto(url);
  const summary = await openSettingsAccount(page);
  await summary.getByRole('button',{name:'Account and saves',exact:true}).waitFor();
  const signedIn=page.locator('.account-summary-state').filter({hasText:'Signed in'});
  await page.waitForFunction(()=>document.querySelector('.account-summary-state')?.textContent==='Signed in'
    || [...document.querySelectorAll('.account-summary button')].some(button=>/^Sign in(?: again)? with GitHub$/.test(button.textContent)));
  if(!await signedIn.isVisible()){
    let left=false;
    try{await summary.getByRole('button',{name:/^Sign in(?: again)? with GitHub$/}).click({timeout:1000});left=true;}
    catch{await signedIn.waitFor({state:'attached'});}
    // The sign-in round trip reloads the app on its title; the account summary lives in Settings.
    if(left)await page.locator('.shell-screen[open][data-mode="title"]').waitFor();
  }
  await openSettingsAccount(page);
  await signedIn.waitFor();
}
