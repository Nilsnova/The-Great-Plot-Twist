// Account summary from server answers: sign-in state, captain name and the sign-in choices.
const accountStates=new Set(['signed_out','signing_in','signed_in','expired','error']);
const text=value=>typeof value==='string'?value:null;

// /api/config auth.providers names the sign-in choices (github, email); GitHub alone when missing.
function providerList(config){
  const list=Array.isArray(config?.auth?.providers)?config.auth.providers.filter(name=>['github','email'].includes(name)):[];
  return list.length?[...new Set(list)]:['github'];
}

export function mapAccount(state={}){
  const accountState=accountStates.has(state.accountState)?state.accountState:'signed_out';
  return {state:accountState,captainName:text(state.me?.captainName)??text(state.nameReply?.captainName),
    canSignIn:state.signInAllowed!==false&&state.auth?.configured!==false,
    signInMessage:state.auth?.configured===false?(text(state.auth?.message)||'Sign-in is not set up on this build.'):
      state.signInAllowed===false?'Sign-in opens later. You can keep playing on this device.':text(state.auth?.message)??'',
    connection:state.connection?{...state.connection}:{state:'idle',message:'',reason:null},
    canReroll:accountState==='signed_in'&&state.nameReply?.rerollsLeft>0,
    namePending:accountState==='signed_in'&&!state.nameReply,
    canRetryName:accountState==='signed_in'&&state.nameStatus==='unavailable',
    guest:accountState==='signed_in'&&state.auth?.guest===true,providers:providerList(state.config)};
}
