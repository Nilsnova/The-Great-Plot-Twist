// Exercise the actual request components in the existing development-only accessibility fixture.
export async function auditRequestStates(page,audit){
  for(const phase of ['loading','slow','empty','error','offline','expired','sign_in_required','rate_limited','online']){
    await page.evaluate(async phase=>{
      const [{createServerCallState},{createModal}]=await Promise.all([
        import('/src/ui/kit/server-call-state.js'),import('/src/ui/kit/modal.js')]);
      let clock=0;
      const call=createServerCallState({label:'connection',now:()=>clock,onRetry(){},onSignIn(){}});
      const modal=createModal({title:'Connection',body:call.element});
      modal.element.classList.add('request-a11y');modal.open(document.querySelector('#game'));
      if(phase==='loading'||phase==='slow'){call.loading({read:true});clock=phase==='slow'?5001:400;}
      else if(phase==='empty')call.succeed({empty:true,message:'No records yet.'});
      else if(phase==='online'){call.setOnline(false);call.setOnline(true);}
      else call.fail({reason:{error:'internal_error',expired:'session_expired'}[phase]??phase,
        message:phase==='sign_in_required'?'Sign in with GitHub to claim your kit. Your progress on this device is kept.':'The service could not complete this request.',retryAfterSeconds:60});
      window.__requestA11yDispose=()=>{call.dispose();modal.dispose();delete window.__requestA11yDispose;};
    },phase);
    try{
      await page.locator(`.request-a11y .server-call[data-state="${phase==='sign_in_required'?'error':phase}"]`).waitFor();
      await audit('request-'+phase,'.request-a11y[open]');
    }finally{await page.evaluate(()=>window.__requestA11yDispose?.());}
  }
}
