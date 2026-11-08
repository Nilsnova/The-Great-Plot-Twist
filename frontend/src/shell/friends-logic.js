// Public account facts choose navigation only; a server still grants every kit and crew seat.
export function friendsPlan(account={},localIntro=false){
  const state=account?.state,offline=['offline','error','expired'].includes(account?.connection?.state);
  const resume=account?.canContinue===true||localIntro===true;
  if(state==='expired'&&account.canSignIn===true)return {action:'account',title:'Return to your crew',
    body:'Sign in again. Your progress on this device is kept.',label:'Account and saves'};
  if(!offline&&state==='signed_in'&&account.hasKit===true)return {action:'crew',resume:true,
    title:'Your crew',body:'Start a crew or join using a crew code.',label:'Open your crew'};
  if(!offline&&state==='signed_in'&&account.hasKit===false)return {action:'story',resume,
    title:'First, your story',body:'Finish your island story to get your starting kit.',label:resume?'Continue your story':'Start your story'};
  if(!offline&&['signed_out','expired','error'].includes(state)&&account.canSignIn===true)return {action:'account',
    title:'Play together',body:'Sign in with GitHub, then start or join a crew.',label:'Account and saves'};
  const localResume=state!=='signed_in'&&localIntro===true;
  return {action:'story',resume:localResume,title:'Explore the island',
    body:'Online crews are unavailable. You can explore solo.',
    label:localResume?'Continue on this device':'Start a new story'};
}
