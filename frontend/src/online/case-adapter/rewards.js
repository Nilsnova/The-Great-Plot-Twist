// Own-row wallet reads become a small public ledger. References and database identifiers are discarded.
export function safeLedgerRows(rows){
  if(!Array.isArray(rows))return [];
  return rows.slice(0,50).filter(row=>Number.isInteger(row?.amount)&&row.amount!==0
    &&Math.abs(row.amount)<=1000000&&typeof row.reason==='string'&&/^[a-z_]{1,50}$/.test(row.reason))
    .map(row=>({amount:row.amount,reason:row.reason,
      created_at:typeof row.created_at==='string'&&row.created_at.length<=80?row.created_at:null}));
}

export async function refreshAccountRewards(ctx){
  const scope=ctx.store.scope();
  if(!ctx.session.isSignedIn()||ctx.store.isClosed())return ctx.refuse('sign_in_required');
  let result;
  try{result=await ctx.auth?.readOwnLedger?.();}catch{result={ok:false};}
  if(!ctx.store.isCurrent(scope)||!ctx.session.isSignedIn())return ctx.refuse('session_expired');
  ctx.store.commit({rewardsRows:result?.ok?safeLedgerRows(result.rows):[]});
  return result?.ok?ctx.accept('Your coin ledger is up to date.'):ctx.refuse('not_connected');
}
