// A restored SDK session can remove the sign-in control between a snapshot and a gesture.
export async function signInFromTitle({page,url}){
  await page.goto(url);
  await page.getByRole('button',{name:'Account and saves',exact:true}).waitFor();
  const signedIn=page.locator('.account-summary-state').filter({hasText:'Signed in'});
  await page.waitForFunction(()=>document.querySelector('.account-summary-state')?.textContent==='Signed in'
    || [...document.querySelectorAll('.account-summary button')].some(button=>/^Sign in(?: again)? with GitHub$/.test(button.textContent)));
  if(!await signedIn.isVisible()){
    try{await page.locator('.account-summary').getByRole('button',{name:/^Sign in(?: again)? with GitHub$/}).click({timeout:1000});}
    catch{await signedIn.waitFor();}
  }
  await signedIn.waitFor();
}
