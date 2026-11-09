// Email code sign-in (Supabase email OTP) for Settings > Account and the account screen.
// Step 1 sends a 6-digit code to the address, step 2 checks it. A guest confirms an address instead,
// so the same captain keeps its progress. All outcomes come from the adapter's signIn answers.
import {node,uniqueId} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';
import {offersEmail} from './providers.js';

export const RESEND_WAIT_MS=60000;
// Supabase's 429 arrives as too_many_tries (rate_limited if a transport layer said so).
const tooMany=result=>['too_many_tries','rate_limited'].includes(result?.reason);
const emailShape=/^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const signInStates=new Set(['signed_out','expired','error']);
const copy={
  sign_in:{title:'Email me a sign-in code',intro:'We email you a 6-digit code. No password needed.',verify:'Sign in',verifying:'Signing in…'},
  upgrade:{title:'Keep progress with email',intro:'We email you a 6-digit code to confirm the address. Your progress stays with this captain.',verify:'Confirm email',verifying:'Confirming…'},
};

// Which form the account shows: a sign-in, a guest's upgrade, or none.
export function emailMode(account){
  if(!offersEmail(account)||account?.canSignIn===false)return 'none';
  const state=account?.state??'signed_out';
  if(signInStates.has(state))return 'sign_in';
  return state==='signed_in'&&account?.guest===true?'upgrade':'none';
}

export function createEmailCodeForm({send,focusPrefix='account-email',now=Date.now,
  setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  const element=node('section','account-email');element.hidden=true;
  const title=node('h4','account-email-title'),intro=node('p','account-muted');
  title.id=uniqueId('account-email-title');element.setAttribute('aria-labelledby',title.id);
  const status=node('p','account-email-status');status.setAttribute('role','status');
  const alert=node('p','account-email-alert');alert.setAttribute('role','alert');

  const field=(labelText,input,key)=>{
    const label=node('label','account-email-field'),id=uniqueId(key);input.id=id;label.htmlFor=id;
    input.dataset.focus=`${focusPrefix}-${key}`;label.append(node('span','',labelText),input);return label;
  };
  const addressForm=node('form','account-email-form'),address=node('input');
  // The form gives its own plain messages, so the browser's validation bubbles stay off.
  addressForm.noValidate=true;
  address.type='email';address.name='email';address.autocomplete='email';address.inputMode='email';
  address.spellcheck=false;address.maxLength=254;address.setAttribute('autocapitalize','off');address.required=true;
  const sendButton=createButton({label:'Send code'});sendButton.element.type='submit';sendButton.element.dataset.focus=`${focusPrefix}-send`;
  addressForm.append(field('Email address',address,'address'),sendButton.element);

  const codeForm=node('form','account-email-form'),sentTo=node('p','account-muted'),code=node('input');codeForm.noValidate=true;
  code.type='text';code.name='code';code.autocomplete='one-time-code';code.inputMode='numeric';
  code.maxLength=7;code.spellcheck=false;code.setAttribute('pattern','[0-9 ]{6,7}');code.required=true;
  const verifyButton=createButton({label:copy.sign_in.verify});verifyButton.element.type='submit';verifyButton.element.dataset.focus=`${focusPrefix}-verify`;
  const resend=createButton({label:'Send a new code',variant:'quiet',onClick:()=>void sendCode(true)});resend.element.dataset.focus=`${focusPrefix}-resend`;
  const change=createButton({label:'Use a different email',variant:'quiet',onClick:()=>{step='address';clearMessages();paint();address.focus();}});
  change.element.dataset.focus=`${focusPrefix}-change`;
  const codeActions=node('div','account-actions');codeActions.append(resend.element,change.element);
  codeForm.append(sentTo,field('6-digit code',code,'code'),verifyButton.element,codeActions);
  element.append(title,intro,addressForm,codeForm,status,alert);

  // step: address, sending, code, verifying or done. mode: sign_in, upgrade or none.
  let mode='none',step='address',email='',resendAt=0,timer=null,disposed=false,request=0,resending=false;
  const clearMessages=()=>{status.textContent='';alert.textContent='';};
  const say=(message,isError)=>{status.textContent=isError?'':message;alert.textContent=isError?message:'';};
  function waitLeft(){return Math.max(0,Math.ceil((resendAt-now())/1000));}
  function schedule(){
    if(timer!==null){clearTimer(timer);timer=null;}
    if(disposed||waitLeft()<=0)return;
    timer=setTimer(()=>{timer=null;paint();schedule();},1000);
    timer?.unref?.();
  }
  function paint(){
    const visible=mode!=='none'||step==='done';element.hidden=!visible;element.dataset.mode=mode;element.dataset.step=step;
    const text=copy[mode==='upgrade'?'upgrade':'sign_in'];title.textContent=text.title;intro.textContent=text.intro;
    const askAddress=step==='address'||step==='sending',askCode=step==='code'||step==='verifying';
    intro.hidden=step==='done';addressForm.hidden=!askAddress||mode==='none';codeForm.hidden=!askCode||mode==='none';
    address.disabled=step==='sending';sendButton.update({label:step==='sending'?'Sending…':'Send code',disabled:step==='sending'});
    code.disabled=step==='verifying';verifyButton.update({label:step==='verifying'?text.verifying:text.verify});
    sentTo.textContent=email?`We sent a code to ${email}. It can take a minute to arrive.`:'';
    const left=waitLeft();
    resend.update({label:resending?'Sending…':left>0?`Send a new code in ${left} s`:'Send a new code',disabled:resending||left>0||step==='verifying'});
    verifyButton.update({disabled:step==='verifying'||resending});change.update({disabled:step==='verifying'||resending});
  }
  async function sendCode(again=false){
    if(disposed||mode==='none'||step==='sending'||step==='verifying'||resending)return;
    const value=again?email:address.value.trim();
    if(!emailShape.test(value)||value.length>254){say('Enter your full email address.',true);address.focus();return;}
    if(again&&waitLeft()>0)return;
    // A new code from the code step keeps that step on screen while it is sent.
    const token=++request,back=again?'code':'address';email=value;if(again)resending=true;else step='sending';clearMessages();paint();
    let result;
    try{result=await send?.('signIn',{provider:'email',email:value,...(mode==='upgrade'?{upgrade:true}:{})});}
    catch{result=null;}
    if(token===request)resending=false;
    if(disposed||token!==request)return;
    if(result?.accepted){
      step='code';resendAt=now()+RESEND_WAIT_MS;code.value='';say(result.message||'Code sent. Check your inbox and spam folder.',false);
      paint();schedule();code.focus();return;
    }
    if(tooMany(result)){resendAt=now()+RESEND_WAIT_MS;schedule();}
    step=back;say(result?.message||'Email sign-in could not finish. Try again in a moment.',true);paint();
    (back==='code'?code:address).focus();
  }
  async function verifyCode(){
    if(disposed||mode==='none'||step!=='code'||resending)return;
    const value=code.value.replace(/\s/g,'');
    if(!/^\d{6}$/.test(value)){say('Enter the 6-digit code from the email.',true);code.focus();return;}
    const token=++request;step='verifying';clearMessages();paint();
    let result;
    try{result=await send?.('signIn',{provider:'email',email,code:value,...(mode==='upgrade'?{upgrade:true}:{})});}
    catch{result=null;}
    if(disposed||token!==request)return;
    if(result?.accepted){step='done';code.value='';say(result.message||'You are signed in.',false);paint();return;}
    step='code';say(result?.message||'Email sign-in could not finish. Try again in a moment.',true);
    if(result?.reason==='wrong_code')code.value='';
    if(tooMany(result)){resendAt=Math.max(resendAt,now()+RESEND_WAIT_MS);schedule();}
    paint();code.focus();
  }
  addressForm.addEventListener('submit',event=>{event.preventDefault();void sendCode(false);});
  codeForm.addEventListener('submit',event=>{event.preventDefault();void verifyCode();});
  function update(account){
    if(disposed)return;
    const next=emailMode(account);
    if(next!==mode){
      // A new sign-in situation starts the form again. A request in flight keeps its answer: a
      // correct code signs in (the account changes first), then the form shows the done message.
      const busy=step==='sending'||step==='verifying'||resending;
      if(!busy&&(step!=='done'||next!=='none')){step='address';email='';code.value='';clearMessages();}
      mode=next;
    }
    paint();
  }
  function dispose(){
    disposed=true;request++;if(timer!==null)clearTimer(timer);timer=null;
    sendButton.dispose();verifyButton.dispose();resend.dispose();change.dispose();element.remove();
  }
  paint();
  return {element,update,dispose,read:()=>({mode,step,waitSeconds:waitLeft()})};
}
