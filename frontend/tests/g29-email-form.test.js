// G29 email: the email code form in a real browser (labels, keyboard, states, resend timer, guest
// upgrade, 375 px). The send function is a fake that answers like the real adapter.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();
const address='captain@example.org';

// Mounts the form with a fake clock and a scripted send; window.answers is consumed in order.
async function mount(page,account){
  await page.evaluate(async account=>{
    const {createEmailCodeForm}=await window.g20Import('/src/screens/account/email-code.js');
    window.sent=[];window.answers=[];window.clock=1000;window.timers=[];
    const send=async(...args)=>{window.sent.push(args);const next=window.answers.shift()??{accepted:true,message:'Code sent. Check your inbox and spam folder.'};
      if(next.wait)await new Promise(resolve=>{window.release=resolve;});return next;};
    window.form=createEmailCodeForm({send,now:()=>window.clock,setTimer:(fn)=>{window.timers.push(fn);return window.timers.length;},clearTimer(){}});
    window.tickClock=ms=>{window.clock+=ms;const due=window.timers.splice(0);for(const fn of due)fn();};
    document.body.append(window.form.element);window.form.update(account);
  },account);
}
const read=page=>page.evaluate(()=>({...window.form.read(),status:document.querySelector('.account-email-status').textContent,
  alert:document.querySelector('.account-email-alert').textContent,focus:document.activeElement?.dataset.focus??null,
  hidden:window.form.element.hidden,sent:window.sent}));

it('sends a code from the keyboard, then signs in with the code',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{state:'signed_out',providers:['github','email']});
    await page.getByRole('heading',{name:'Email me a sign-in code'}).waitFor();
    const email=page.getByRole('textbox',{name:'Email address',exact:true});
    expect(await email.getAttribute('type')).toBe('email');expect(await email.getAttribute('autocomplete')).toBe('email');
    await email.focus();await page.keyboard.type(address);
    await page.evaluate(()=>{window.answers.push({accepted:true,message:'Code sent. Check your inbox and spam folder.',wait:true});});
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Sending…'}).waitFor();
    expect(await page.getByRole('button',{name:'Sending…'}).isDisabled()).toBe(true);
    await page.evaluate(()=>window.release());
    const code=page.getByRole('textbox',{name:'6-digit code',exact:true});await code.waitFor();
    let state=await read(page);
    expect(state).toMatchObject({step:'code',waitSeconds:60,status:'Code sent. Check your inbox and spam folder.',alert:'',focus:'account-email-code'});
    expect(state.sent).toEqual([['signIn',{provider:'email',email:address}]]);
    expect(await code.getAttribute('autocomplete')).toBe('one-time-code');expect(await code.getAttribute('inputmode')).toBe('numeric');
    expect(await page.getByText(`We sent a code to ${address}.`).count()).toBe(1);
    expect(await page.getByRole('button',{name:'Send a new code in 60 s'}).isDisabled()).toBe(true);
    await page.evaluate(()=>window.answers.push({accepted:true,message:'You are signed in.'}));
    await page.keyboard.type('123 456');await page.keyboard.press('Enter');
    await page.getByText('You are signed in.').waitFor();
    state=await read(page);
    expect(state.sent[1]).toEqual(['signIn',{provider:'email',email:address,code:'123456'}]);
    expect(state.step).toBe('done');
    // Signed in: the account no longer asks for email, but the done message stays readable.
    await page.evaluate(()=>window.form.update({state:'signed_in',providers:['github','email']}));
    expect(await read(page)).toMatchObject({hidden:false,mode:'none',step:'done',status:'You are signed in.'});
    expect(await page.getByRole('textbox').count()).toBe(0);
  });
});

it('says what went wrong: bad address, wrong code, too many requests',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{state:'signed_out',providers:['email']});
    const email=page.getByRole('textbox',{name:'Email address',exact:true});
    await email.fill('captain');await page.getByRole('button',{name:'Send code',exact:true}).click();
    expect(await read(page)).toMatchObject({step:'address',alert:'Enter your full email address.',focus:'account-email-address',sent:[]});
    expect(await page.getByRole('alert').textContent()).toBe('Enter your full email address.');
    await page.evaluate(()=>window.answers.push({accepted:false,reason:'too_many_tries',message:'Too many requests. Wait a minute, then try again.'}));
    await email.fill(address);await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByText('Too many requests. Wait a minute, then try again.').waitFor();
    expect(await read(page)).toMatchObject({step:'address',waitSeconds:60,focus:'account-email-address'});
    await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByRole('textbox',{name:'6-digit code',exact:true}).waitFor();
    const code=page.getByRole('textbox',{name:'6-digit code',exact:true});
    await code.fill('12');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    expect(await read(page)).toMatchObject({alert:'Enter the 6-digit code from the email.',focus:'account-email-code'});
    await page.evaluate(()=>window.answers.push({accepted:false,reason:'wrong_code',message:'That code is wrong or has expired. Check it, or send a new code.'}));
    await code.fill('999999');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByText('That code is wrong or has expired. Check it, or send a new code.').waitFor();
    expect(await read(page)).toMatchObject({step:'code',focus:'account-email-code'});
    expect(await code.inputValue()).toBe('');
    // Another address goes back to the first step.
    await page.getByRole('button',{name:'Use a different email',exact:true}).click();
    expect(await read(page)).toMatchObject({step:'address',alert:'',focus:'account-email-address'});
  });
});

it('offers a new code only after 60 seconds, for the same address',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{state:'expired',providers:['github','email']});
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill(address);
    await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByRole('button',{name:'Send a new code in 60 s'}).waitFor();
    await page.evaluate(()=>window.tickClock(1000));
    expect(await page.getByRole('button',{name:'Send a new code in 59 s'}).isDisabled()).toBe(true);
    await page.evaluate(()=>window.tickClock(58000));
    expect(await page.getByRole('button',{name:'Send a new code in 1 s'}).isDisabled()).toBe(true);
    await page.evaluate(()=>window.tickClock(1000));
    const resend=page.getByRole('button',{name:'Send a new code',exact:true});
    expect(await resend.isDisabled()).toBe(false);
    await page.evaluate(()=>window.answers.push({accepted:true,message:'Code sent. Check your inbox and spam folder.',wait:true}));
    await resend.click();
    // While the new code is sent, the code step stays on screen and cannot be submitted twice.
    await page.getByRole('button',{name:'Sending…'}).waitFor();
    expect(await page.getByRole('textbox',{name:'6-digit code',exact:true}).isVisible()).toBe(true);
    expect(await page.getByRole('button',{name:'Sign in',exact:true}).isDisabled()).toBe(true);
    await page.evaluate(()=>window.release());
    await page.getByRole('button',{name:'Send a new code in 60 s'}).waitFor();
    expect((await read(page)).focus).toBe('account-email-code');
    expect((await read(page)).sent).toEqual([['signIn',{provider:'email',email:address}],['signIn',{provider:'email',email:address}]]);
  });
});

it('lets a guest confirm an email and keep their progress',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{state:'signed_in',guest:true,providers:['github','email']});
    await page.getByRole('heading',{name:'Keep progress with email'}).waitFor();
    expect(await page.getByText('Your progress stays with this captain.',{exact:false}).count()).toBe(1);
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill(address);
    await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByRole('textbox',{name:'6-digit code',exact:true}).fill('654321');
    await page.evaluate(()=>window.answers.push({accepted:true,message:'Email confirmed. Your progress is kept.',wait:true}));
    await page.getByRole('button',{name:'Confirm email',exact:true}).click();
    await page.getByRole('button',{name:'Confirming…'}).waitFor();
    // The account stops being a guest before the answer returns; the answer still shows.
    await page.evaluate(()=>{window.form.update({state:'signed_in',guest:false,providers:['github','email']});window.release();});
    await page.getByText('Email confirmed. Your progress is kept.').waitFor();
    const state=await read(page);
    expect(state.sent).toEqual([['signIn',{provider:'email',email:address,upgrade:true}],
      ['signIn',{provider:'email',email:address,code:'654321',upgrade:true}]]);
    expect(state).toMatchObject({mode:'none',step:'done',hidden:false});
  });
});

it('stays hidden when email is not offered or the player is signed in',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page,{state:'signed_out',providers:['github']});
    expect((await read(page)).hidden).toBe(true);
    for(const account of [{state:'signed_in',providers:['email']},{state:'signed_out',providers:['email'],canSignIn:false},{state:'signing_in',providers:['email']}]){
      await page.evaluate(account=>window.form.update(account),account);
      expect((await read(page)).hidden).toBe(true);
    }
    await page.evaluate(()=>window.form.update({state:'signed_out',providers:['email']}));
    expect((await read(page)).hidden).toBe(false);
    await page.evaluate(()=>window.form.dispose());
    expect(await page.locator('.account-email').count()).toBe(0);
  });
});

it('fits a 375 px phone without sideways scrolling',async()=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width:375,height:812});
    await page.evaluate(async()=>{await window.g20Import('/src/screens/account/account.css');});
    await mount(page,{state:'signed_out',providers:['github','email']});
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('a.very.long.address.for.testing@example.org');
    await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByRole('textbox',{name:'6-digit code',exact:true}).waitFor();
    const layout=await page.evaluate(()=>{const box=window.form.element.getBoundingClientRect();
      const controls=[...window.form.element.querySelectorAll('input,button')].filter(item=>item.offsetParent).map(item=>{const rect=item.getBoundingClientRect();return {right:rect.right,height:rect.height};});
      return {scroll:document.documentElement.scrollWidth,right:box.right,controls};});
    expect(layout.scroll).toBeLessThanOrEqual(375);expect(layout.right).toBeLessThanOrEqual(375);
    for(const control of layout.controls){expect(control.right).toBeLessThanOrEqual(375);expect(control.height).toBeGreaterThanOrEqual(44);}
  });
});

it('keeps a typed address and its focus while the account screen repaints',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      const {createAccountScreen}=await window.g20Import('/src/screens/account/index.js');
      window.sent=[];window.screen=createAccountScreen({send:async(...args)=>{window.sent.push(args);return {accepted:true,message:'Code sent. Check your inbox and spam folder.'};}});
      document.body.append(window.screen.element);
      window.screen.update({account:{state:'signed_out',providers:['github','email'],save:{state:'idle'}}});
    });
    expect(await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).count()).toBe(1);
    expect(await page.getByRole('button',{name:/Google/}).count()).toBe(0);
    const email=page.getByRole('textbox',{name:'Email address',exact:true});
    await email.focus();await page.keyboard.type('captain@exa');
    await page.evaluate(()=>window.screen.update({account:{state:'signed_out',captainName:'Placeholder captain',providers:['github','email'],save:{state:'idle'}}}));
    expect(await email.inputValue()).toBe('captain@exa');
    expect(await page.evaluate(()=>document.activeElement?.dataset.focus)).toBe('account-email-address');
    await page.keyboard.type('mple.org');await page.keyboard.press('Enter');
    await page.getByRole('textbox',{name:'6-digit code',exact:true}).waitFor();
    expect(await page.evaluate(()=>window.sent)).toEqual([['signIn',{provider:'email',email:'captain@example.org'}]]);
    await page.evaluate(()=>window.screen.dispose());
  });
});
