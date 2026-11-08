// Common call presentation delegates every explicit retry to the existing market session/trade owners.
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {marketCallFailure} from './call-results.js';
import {OUTCOME_UNKNOWN} from './words.js';
export function createMarketCalls({session,trades,messageElement,isActive,onSignIn,onResult=()=>{},onChange=()=>{},now=Date.now,reportLink}){
  let disposed=false,scope=0,generation=0,owner=null,lastAction=null,lastFailure=null,lastFailureRead=null,lastRetry='trade';
  let cooldownAt=0,actionNotice=false,lastMessage='';
  const readErrors=new Map();
  const remaining=()=>Math.max(0,cooldownAt-now(),trades.retryAfterMs??0);
  const active=()=>!disposed&&isActive();
  const expired=()=>({kind:'expired',message:''});
  const call=createServerCallState({messageElement,label:'market request',onRetry:()=>retry(),onSignIn,now,reportLink,
    onChange:()=>onChange()});
  function fail(result,readName=null,retryAt){
    lastFailure=marketCallFailure(result);lastFailureRead=readName;
    if(lastFailure.reason==='rate_limited'){
      const seconds=lastFailure.retryAfterSeconds??0;
      const deadline=retryAt??now()+((trades.retryAfterMs??0)>0?trades.retryAfterMs:seconds*1000);
      cooldownAt=Math.max(cooldownAt,deadline);
    }
  }
  function paint(){
    if(!active())return;
    const retry=call.element.querySelector?.('[data-focus="retry-server-call"]');
    const label=lastFailureRead==='refreshBoard'?'Retry prices':lastFailureRead||lastRetry==='check'?'Retry checking positions':'Retry trade';
    if(retry){retry.textContent=label;retry.setAttribute('aria-label',label);}
    if(lastFailure)call.fail(lastFailure,lastFailure.reason==='rate_limited'?{retryAfterMs:remaining()}:undefined);
    else if(trades.pending&&!lastMessage)call.showMessage(OUTCOME_UNKNOWN);
    else call.showMessage(lastMessage);
  }
  function readState(){
    const failed=[...readErrors].at(-1);
    if(failed)fail(failed[1].result,failed[0],failed[1].retryAt);else{lastFailure=null;lastFailureRead=null;lastMessage='';}
    paint();
  }
  async function run(send,{read=false,action=true,remember=true,focus=action,name=null,retryKind='trade'}={}){
    if(!active())return expired();
    if(remaining()>0||action&&owner?.action)return {kind:'busy',message:''};
    const account=scope,present=action||!owner&&!actionNotice&&!trades.pending;
    const task=present?{generation:++generation,action}:null;
    if(task){owner=task;call.loading({read});}
    if(action&&remember)lastAction={send,read};
    onChange();
    let result;
    try{result=await send();}catch{result={ok:false,code:'network_error',status:0};}
    if(disposed||account!==scope)return expired();
    const current=owner===task&&task?.generation===generation;
    if(current)owner=null;
    if(action){
      onResult(result);if(disposed||account!==scope)return expired();
      actionNotice=true;lastFailureRead=null;lastRetry=retryKind;
      const successful=['done','already_done','checked','forgotten','nothing'].includes(result.kind);
      if(successful){lastFailure=null;lastMessage=result.message||'';}
      else if(['busy','blocked','expired'].includes(result.kind)){lastFailure=null;lastMessage=result.message||'';}
      else fail(result);
      if(active()&&(current||!owner?.action)){owner=null;generation+=1;paint();if(focus&&current&&messageElement.textContent&&!messageElement.hidden)messageElement.focus();}
    }else{
      if(result?.ok)readErrors.delete(name);else{
        const failure=marketCallFailure(result),retryAt=failure.reason==='rate_limited'?now()+(failure.retryAfterSeconds??0)*1000:undefined;
        readErrors.set(name,{result,retryAt});if(retryAt!==undefined)cooldownAt=Math.max(cooldownAt,retryAt);
      }
      if(active()&&!owner&&!actionNotice&&!trades.pending)readState();
    }
    onChange();return result;
  }
  function read(name){
    return run(()=>session[name](),{read:true,action:false,remember:false,focus:false,name});
  }
  function retry(){
    if(!active()||remaining()>0||owner?.action)return;
    if(lastFailureRead)return read(lastFailureRead);
    if(lastRetry==='check')return run(()=>trades.checkAgain(),{read:true,remember:false,retryKind:'check'});
    if(trades.pending||lastRetry==='resend')return run(()=>trades.sendAgain(),{read:true,remember:false,retryKind:'resend'});
    if(lastAction)return run(lastAction.send,{read:lastAction.read,remember:false});
  }
  function cancel(){if(disposed)return;generation+=1;owner=null;call.clear();onChange();}
  function resume(){
    if(!active())return;
    if(!trades.pending&&remaining()===0&&lastFailure?.reason!=='rate_limited'){
      lastFailure=null;lastFailureRead=null;lastMessage='';actionNotice=false;readErrors.clear();
    }
    paint();onChange();
  }
  function reset(){if(disposed)return;cancel();scope+=1;lastAction=null;lastFailure=null;lastFailureRead=null;cooldownAt=0;actionNotice=false;lastMessage='';lastRetry='trade';readErrors.clear();}
  return {element:call.element,run,read,retry,cancel,resume,reset,
    notice(text){if(active()&&!owner&&!lastFailure)call.showMessage(text);},
    get blocked(){return !!owner?.action||trades.busy||remaining()>0;},
    dispose(){if(disposed)return;reset();disposed=true;call.dispose();},
  };
}
