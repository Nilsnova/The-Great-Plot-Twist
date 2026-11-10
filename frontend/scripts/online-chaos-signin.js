// A restored SDK session can remove the sign-in control between a snapshot and a gesture.
import {openSettingsAccount} from './online-browser-actions.js';
export async function signInFromTitle({page,url}){
  await page.goto(url);
  const summary = await openSettingsAccount(page);
  await summary.getByRole('button',{name:'Account',exact:true}).waitFor();
  const signedIn=page.locator('.account-summary-state').filter({hasText:'Signed in'});
  await page.waitForFunction(()=>document.querySelector('.account-summary-state')?.textContent==='Signed in'
    || [...document.querySelectorAll('.account-summary button')].some(button=>/^Sign in(?: again)? with GitHub$/.test(button.textContent)));
  if(!await signedIn.isVisible()){
    // The sign-in round trip reloads the app on its title, where no account summary lives. A click can
    // time out while that navigation starts, and a restored session can remove the control first.
    try{await summary.getByRole('button',{name:/^Sign in(?: again)? with GitHub$/}).click({timeout:1000});}
    catch{/* Settled below either way. */}
    await page.waitForFunction(()=>document.querySelector('.shell-screen[open]')?.dataset.mode==='title'
      ||document.querySelector('.account-summary-state')?.textContent==='Signed in');
  }
  await openSettingsAccount(page);
  await signedIn.waitFor();
}
