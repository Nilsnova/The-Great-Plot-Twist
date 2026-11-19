// Actual registered transport boundaries plus explicitly trusted wager-input SQL.
// The caller supplies the separately owned local provider/API/observer helpers.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';

const uid=()=>randomUUID().replaceAll('-','');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]]));
const status=(answer,expected,message)=>assert.equal(answer.status,expected,message+': '+JSON.stringify(answer.data));

export async function runCompatibility({clients,request,observe,install,admit,outputDir,sourceCommit}) {
  const [owner,member,legacy]=clients;
  assert.ok(owner&&member&&legacy,'Three isolated registered API clients are required.');
  const report={sourceCommit,status:'running',scenario:'authenticated-compatibility-and-cross-domain',
    scenarioSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    steps:[],limits:[
      'Real provider Auth and production HTTP; this API-only scenario does not establish rendered gameplay.',
      'A ten-coin fresh shared admission and saved Harbor unlock are explicit installer setup.',
      'Wager opening terms below are trusted fixture inputs to the actual RPC, not an authenticated HTTP opener or natural feed.',
      'No combat HP, terminal result or stored clock is injected. Repair competition is separately scoped.',
    ]};
  const record=(name,data)=>report.steps.push({name,...data});
  const get=(client,path)=>request(client,path);
  const post=(client,path,body,options={})=>request(client,path,{method:'POST',...(body===undefined?{}:{body}),...options});
  const wallets=()=>observe(`select w.player_id,w.balance::text as balance,
    (select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as transactions
    from public.wallets w where w.player_id=any($1::uuid[]) order by w.player_id`,[clients.map(c=>c.actorId)]);
  const money=async()=>{
    const rows=await observe(`select a.id as account,a.run_epoch as epoch,a.balance_coins::text as balance,
      a.committed_coins::text as committed,a.revision::text as revision,
      coalesce(sum(t.balance_delta),0)::text as ledger_balance,
      coalesce(sum(t.committed_delta),0)::text as ledger_committed,count(t.id)::text as ledger_entries
      from public.island_economy_accounts a join public.island_economy_state s on s.current_account_id=a.id
      left join public.island_treasury_transactions t on t.account_id=a.id
      where s.island_owner=$1::uuid group by a.id`,[owner.actorId]);
    assert.equal(rows.length,1);const row=rows[0];
    assert.equal(row.balance,row.ledger_balance);assert.equal(row.committed,row.ledger_committed);
    assert.equal(row.revision,row.ledger_entries);assert.ok(BigInt(row.balance)>=BigInt(row.committed));return row;
  };
  await mkdir(outputDir,{recursive:true});
  try {
    for(const client of [owner,legacy])status(await post(client,'/api/games',{actionUid:uid()}),200,'ordinary game creation');
    const oldOwner=await get(owner,'/api/island');status(oldOwner,200,'legacy owner read');
    const oldWallets=await wallets(),oldOwnerWallet=oldWallets.find(w=>w.player_id===owner.actorId);
    const challenge=await post(owner,'/api/duels',{rounds:3,stake:10,signals:['shade','shade','shade'],actionUid:uid()});
    status(challenge,200,'actual old private duel opening');
    const duel=challenge.data.duel.id;
    assert.equal(challenge.data.duel.status,'open');
    const heldWallet=(await wallets()).find(w=>w.player_id===owner.actorId);
    assert.equal(BigInt(heldWallet.balance),BigInt(oldOwnerWallet.balance)-10n);
    status(await post(member,'/api/games/join',{code:oldOwner.data.code,actionUid:uid()}),200,'ordinary invited membership');
    await admit(owner.actorId,{coins:10});
    await install('update public.islands set wave_best=4 where player_id=$1::uuid',[owner.actorId],
      'Saved Harbor unlock only; no Captain milestone, combat health, outcome or clock claim.');
    let snapshot=await get(owner,'/api/island');status(snapshot,200,'shared snapshot');
    for(const client of [owner,member])status(await post(client,'/api/island/session/attach',{
      economy:context(snapshot.data.economy),sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid(),
    }),200,'actual API controller attachment');
    snapshot=await get(owner,'/api/island');
    const initial=await money(),cancel=await post(owner,`/api/duels/${duel}/cancel`);
    status(cancel,200,'old personal obligation closes after shared admission');
    assert.equal(cancel.data.duel.status,'withdrawn');
    assert.deepEqual(await money(),initial);
    const returned=(await wallets()).find(w=>w.player_id===owner.actorId);
    assert.equal(returned.balance,oldOwnerWallet.balance);
    record('old-private-duel-keeps-personal-recipient',{openedBeforeAdmission:true,closedAfterAdmission:true,
      privateBefore:oldOwnerWallet.balance,heldPrivate:heldWallet.balance,returnedPrivate:returned.balance,island:initial});

    const quote=snapshot.data.quotes.build.find(q=>q.available&&q.target.spot==='wall_1'&&q.target.kind==='wall');
    assert.ok(quote);const build={economy:context(snapshot.data.economy),actionUid:uid(),...quote.intent};
    const beforeFences={island:await money(),wallets:await wallets()};
    const fences=[];
    for(const [name,call,expected] of [
      ['missing capability read',()=>request(owner,'/api/island',{capability:null}),409],
      ['unsupported capability read',()=>request(owner,'/api/island',{capability:'999'}),409],
      ['legacy build on admitted island',()=>post(owner,'/api/island/build',{spot:'wall_1',kind:'wall',actionUid:uid()}),409],
      ['missing epoch',()=>post(owner,'/api/island/build',{...build,economy:{...build.economy,runEpoch:undefined}}),422],
      ['forged actor',()=>post(member,'/api/island/build',{...build,actorId:owner.actorId}),422],
      ['legacy protocol on shared island',()=>post(owner,'/api/waves/start',{where:'own',waveProtocol:1,actionUid:uid()}),409],
      ['native protocol without proof',()=>post(owner,'/api/waves/start',{where:'own',waveProtocol:2,actionUid:uid()}),409],
      ['excluded exchange with island payload',()=>post(owner,'/api/market/open',{
        companyId:'harbor-trust',side:'rising',stake:10,actionUid:uid(),economy:build.economy}),422],
      ['private duel with island payload',()=>post(owner,'/api/duels',{
        rounds:3,stake:10,signals:['shade','shade','shade'],actionUid:uid(),economy:build.economy}),422],
    ]){
      const answer=await call();status(answer,expected,name);fences.push({name,status:answer.status,code:answer.data?.error?.code});
    }
    assert.deepEqual({island:await money(),wallets:await wallets()},beforeFences);
    record('old-client-protocol-and-excluded-payload-fences',{fences,noIslandOrPersonalEffects:true});

    const point=await get(legacy,'/api/pirate-point');status(point,200,'legacy Pirate Point read');
    const home=await get(legacy,'/api/islet');status(home,200,'legacy personal islet read');
    const legacyWallet=(await wallets()).find(w=>w.player_id===legacy.actorId);
    assert.equal(String(point.data.coins),legacyWallet.balance);
    assert.equal(String(home.data.coins),legacyWallet.balance);
    record('legacy-point-and-islet-read-personal-funds',{pointCoins:String(point.data.coins),
      isletCoins:String(home.data.coins),islandMoneyUnchanged:await money()});

    const freePointWall=point.data.spots.find(row=>!row.built&&row.kinds.includes('wall'));
    assert.ok(freePointWall,'This isolated case needs an unused legacy Pirate Point wall spot.');
    const pointBody={spot:freePointWall.id,kind:'wall',actionUid:uid()},pointBefore=await money();
    const pointPurchase=await post(legacy,'/api/pirate-point/build',pointBody);
    status(pointPurchase,200,'legacy personal-funded Pirate Point build');
    const pointReplay=await post(legacy,'/api/pirate-point/build',pointBody);
    status(pointReplay,200,'legacy Pirate Point exact replay');
    const pointWallet=(await wallets()).find(w=>w.player_id===legacy.actorId);
    assert.equal(BigInt(pointWallet.balance),BigInt(legacyWallet.balance)-BigInt(freePointWall.cost));
    assert.deepEqual(await money(),pointBefore);
    record('legacy-point-build-and-replay-retain-personal-accounting',{paidCoins:freePointWall.cost,
      privateBefore:legacyWallet.balance,privateAfter:pointWallet.balance,islandUnchanged:true});
    const oldCurrent=await get(legacy,'/api/waves/current?where=own&waveProtocol=1');
    status(oldCurrent,200,'supported legacy protocol idle read');assert.equal(oldCurrent.data,null);
    record('legacy-protocol-one-idle-read',{status:oldCurrent.status,currentWave:null,
      boundary:'No legacy combat outcome or new protocol-one bell is inferred from an idle read.'});

    const raceWallets=await wallets(),action=uid(),gate='compat-'+action;
    const opened=()=>install(`with marker as materialized (select set_config('application_name',$5,true)),
      locked as materialized (select public.island_treasury_lock_scope($2::uuid) from marker),
      pause as materialized (select pg_sleep(2) from locked),
      moment as materialized (select clock_timestamp() as value from pause)
      select public.island_wager_open($1::uuid,$2::uuid,$3::uuid,$4,'market_call','harbor-trust','up',10,
      jsonb_build_object('asset','harbor-trust','price','100','source','live',
      'fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment`,
      [member.actorId,owner.actorId,initial.epoch,action,gate],
      'Trusted price plus a real two-second transaction scope-lock gate; no stored clock or HTTP price-source override.');
    const wagerFlight=opened();let observedGate=false;
    const gateDeadline=Date.now()+10000;
    while(Date.now()<gateDeadline){
      const rows=await observe('select wait_event from pg_stat_activity where application_name=$1',[gate]);
      if(rows.some(row=>row.wait_event==='PgSleep')){observedGate=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(observedGate,'the real wager transaction must hold the canonical scope before the HTTP contender');
    const [purchased,wagerRows]=await Promise.all([post(owner,'/api/island/build',build),wagerFlight]);
    const wager=wagerRows[0].result;
    assert.equal(Number(purchased.status===200)+Number(wager.status==='done'),1);
    if(purchased.status!==200){status(purchased,409,'last-funds purchase refusal');
      assert.equal(purchased.data?.error?.code,'insufficient_funds');}
    const after=await money();
    assert.deepEqual([after.balance,after.committed],purchased.status===200?['0','0']:['10','10']);
    assert.deepEqual(await wallets(),raceWallets);
    record('last-funds-construction-versus-trusted-wager',{canonicalScopeGateObserved:observedGate,purchaseStatus:purchased.status,
      purchaseError:purchased.data?.error?.code??null,wagerStatus:wager.status,
      wagerRefusal:wager.reason??null,committed:after,
      layer:'Actual authenticated construction HTTP against actual trusted-input product RPC; no HTTP price-source claim.'});
    report.status='passed';
  }catch(error){report.status='failed';report.error=String(error);throw error;}
  finally{await writeFile(outputDir+'/compatibility-result.json',JSON.stringify(report,null,2)+'\n');}
  return report;
}
