// Real-time production-controller damage and authenticated repair versus trusted wager accounting.
import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
registerHooks({load(url,context,next){return next(url,url.endsWith('.json')
  ?{...context,importAttributes:{type:'json'}}:context);}});
const {createWaveController}=await import('../../src/pirates/controller.js');
const {createRecoveryTransport}=await import('../../src/pirates/recovery-transport.js');
const context=e=>Object.fromEntries(['mode','version','islandOwner','runEpoch'].map(k=>[k,e[k]]));
const origin=e=>Object.fromEntries(['mode','version','islandOwner','accountId','runEpoch'].map(k=>[k,e[k]]));
const uid=()=>randomUUID().replaceAll('-','');
const expectStatus=(r,n,why)=>assert.equal(r.status,n,why+': '+JSON.stringify(r.data));

export async function runRepairWager({clients,request,observe,install,admit,sourceCommit,outputDir}) {
  const [owner,member]=clients,report={sourceCommit,status:'running',scenario:'real-time-controller-repair-wager-race',
    startedAt:new Date().toISOString(),scenarioSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    setup:'Explicit fresh70-coin admission, six real10-coin wall purchases, saved Harbor unlock4 and normal selected countdown0. Minimum finish and server clock unchanged.',
    steps:[],limits:['Actual registered Auth/API with the unmodified production controller, journal and real elapsed time; no rendered browser claim.',
      'Trusted current-price inputs call the canonical wager RPC; not a natural feed or HTTP wager-opening claim.',
      'No HP, combat result, stored clock, journal or frozen roster is fabricated.']};
  let controller,timer,heartbeat;const proofs=new Map(),post=(c,path,body)=>request(c,path,{method:'POST',body});
  const wallets=()=>observe(`select w.player_id,w.balance::text as balance,
    (select count(*)::integer from public.wallet_transactions t where t.player_id=w.player_id) as transactions
    from public.wallets w where w.player_id=any($1::uuid[]) order by w.player_id`,[clients.map(c=>c.actorId)]);
  const money=async()=>{
    const [row]=await observe(`select a.balance_coins::text as balance,a.committed_coins::text as committed,
      coalesce(sum(t.balance_delta),0)::text as ledger_balance,coalesce(sum(t.committed_delta),0)::text as ledger_committed,
      count(t.id)::text as entries,a.revision::text as revision from public.island_economy_accounts a
      left join public.island_treasury_transactions t on t.account_id=a.id where a.id=$1::uuid group by a.id`,[proofs.get(owner).origin.accountId]);
    assert.equal(row.balance,row.ledger_balance);assert.equal(row.committed,row.ledger_committed);assert.equal(row.entries,row.revision);return row;
  };
  await mkdir(outputDir,{recursive:true});
  try {
    expectStatus(await post(owner,'/api/games',{actionUid:uid()}),200,'game create');
    const home=await request(owner,'/api/island');expectStatus(home,200,'game read');
    expectStatus(await post(member,'/api/games/join',{code:home.data.code,actionUid:uid()}),200,'member join');
    await admit(owner.actorId,{coins:70});
    await install('update public.islands set wave_best=4 where player_id=$1::uuid',[owner.actorId],
      'Saved Harbor unlock only; no combat, personal progress or clock fixture.');
    let shared=await request(owner,'/api/island');
    for(const c of clients){const attached=await post(c,'/api/island/session/attach',{
      economy:context(shared.data.economy),sessionId:randomUUID(),expectedGeneration:'0',actionUid:uid()});
      expectStatus(attached,200,'controller attach');proofs.set(c,{actorId:c.actorId,origin:origin(attached.data.economy),
        sessionId:attached.data.session.sessionId,connectionGeneration:attached.data.session.connectionGeneration});}
    const proof=c=>{const p=proofs.get(c);return {economy:context(p.origin),sessionId:p.sessionId,connectionGeneration:p.connectionGeneration};};
    for(let index=1;index<=6;index++){
      shared=await request(owner,'/api/island');const q=shared.data.quotes.build.find(q=>q.available&&q.target.spot==='wall_'+index);
      assert.ok(q);assert.equal(q.intent.quotedCoins,'10');
      expectStatus(await post(owner,'/api/island/build',{economy:context(shared.data.economy),actionUid:uid(),...q.intent}),200,'actual wall purchase');}
    assert.deepEqual([(await money()).balance,(await money()).committed],['10','0']);
    expectStatus(await post(owner,'/api/island/session/settings',{...proof(owner),actionUid:uid(),countdownSeconds:0,autoNext:false}),200,'ordinary countdown setting');
    const started=await post(owner,'/api/waves/start',{...proof(owner),where:'own',waveProtocol:2,actionUid:uid()});
    expectStatus(started,200,'native bell');const wave=started.data;
    assert.equal(wave.waveProtocol,2);assert.equal(wave.initialSnapshot.participants.length,2);
    heartbeat=setInterval(()=>{for(const c of clients)void post(c,'/api/island/session/heartbeat',proof(c));},4000);
    const transport={
      async get(path){const url=new URL(path,'http://localhost');const p=proofs.get(owner);
        for(const [k,v] of Object.entries({islandOwner:p.origin.islandOwner,runEpoch:p.origin.runEpoch,sessionId:p.sessionId,connectionGeneration:p.connectionGeneration}))url.searchParams.set(k,v);
        const r=await request(owner,url.pathname+url.search);return {ok:r.status===200,status:r.status,data:r.data,code:r.data?.error?.code};},
      async post(path,body){const r=await post(owner,path,{...body,...proof(owner)});
        return {ok:r.status===200,status:r.status,data:r.data,code:r.data?.error?.code};},
    };
    controller=createWaveController({getSessionProof:()=>proofs.get(owner),recoveryTransport:createRecoveryTransport(transport),
      recoveryPlayoutMs:0,now:()=>Date.now(),world:{player:{position:{x:0,z:0}},place:()=> 'home_islet'},place:'home_islet',
      createRenderer:()=>null,createHud:()=>null,loadAuto:()=>false});
    assert.ok(controller.start({...wave,nativeShared:true,spectator:false,controlSessionId:proofs.get(owner).sessionId}));
    timer=setInterval(()=>controller.update(.05),50);
    const until=Date.now()+90000;let damaged;
    while(Date.now()<until){const row=controller.recoveryCombatState?.structures?.find(row=>row.hpUnits<1000000);
      if(row){damaged=row;break;}assert.ok(!controller.wave?.done,'normal simulation ended before damage observation');
      await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(damaged,'production controller must observe natural damage');
    const checkpoint=await controller.checkpointBeforeRepair();assert.equal(checkpoint.ok,true,JSON.stringify(checkpoint));
    const state=await request(owner,'/api/island/structures');expectStatus(state,200,'canonical structure read');
    const target=state.data.structures.find(row=>row.spot===damaged.spot);
    assert.ok(target.hpUnits<1000000);assert.equal(target.fixedPrice,10);assert.equal(state.data.waveId,wave.waveId);
    const privateBefore=await wallets(),before=await money(),repair={economy:context(proofs.get(member).origin),spot:target.spot,instanceId:target.instanceId,
      actionUid:uid(),expectedEpoch:state.data.islandEpoch,expectedWindow:'reserved_wave',expectedWaveId:wave.waveId,
      expectedLevel:target.level,expectedRepairSeq:target.repairSeq,quotedPrice:target.fixedPrice,waveProtocol:2};
    report.steps.push({name:'natural real-time damage accepted by canonical checkpoint',waveId:wave.waveId,
      spot:target.spot,hpUnits:target.hpUnits,checkpoint,minimumSeconds:wave.minimumSeconds,elapsedSeconds:(Date.now()-Date.parse(wave.startsAt))/1000});
    const action=uid(),gate='repair-'+action;
    const wagerFlight=install(`with marker as materialized (select set_config('application_name',$5,true)),
        locked as materialized (select public.island_treasury_lock_scope($2::uuid) from marker),
        pause as materialized (select pg_sleep(2) from locked),
        moment as materialized (select clock_timestamp() as value from pause)
        select public.island_wager_open($1::uuid,$2::uuid,$3::uuid,$4,'market_call','harbor-trust','up',10,
        jsonb_build_object('asset','harbor-trust','price','100','source','live','fetchedAt',moment.value,'quotedAt',moment.value)) as result from moment`,
        [owner.actorId,owner.actorId,proofs.get(owner).origin.runEpoch,action,gate],
        'Trusted price plus a real two-second canonical scope-lock gate; no stored clock or HTTP opener override.');
    let observedGate=false;const gateDeadline=Date.now()+10000;
    while(Date.now()<gateDeadline){const rows=await observe('select wait_event from pg_stat_activity where application_name=$1',[gate]);
      if(rows.some(row=>row.wait_event==='PgSleep')){observedGate=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
    assert.ok(observedGate,'the real wager transaction must hold the canonical scope before the HTTP repair contender');
    const [paid,openedRows]=await Promise.all([post(member,'/api/island/structures/repair',repair),wagerFlight]);
    const opened=openedRows[0].result;
    assert.equal(Number(paid.status===200)+Number(opened.status==='done'),1);
    if(paid.status!==200){expectStatus(paid,409,'repair funds refusal');assert.equal(paid.data?.error?.code,'insufficient_funds');}
    const after=await money();assert.deepEqual([after.balance,after.committed],paid.status===200?['0','0']:['10','10']);
    const [uses]=await observe('select paid_used from public.recovery_wave_states where wave_id=$1::uuid',[wave.waveId]);
    assert.equal(uses.paid_used,paid.status===200?1:0);
    assert.deepEqual(await wallets(),privateBefore);
    report.steps.push({name:'eligible repair and wager serialize the last10coins',canonicalScopeGateObserved:observedGate,before,after,repairStatus:paid.status,
      repairError:paid.data?.error?.code??null,wagerStatus:opened.status,wagerRefusal:opened.reason??null,paidUses:uses.paid_used,
      personalWalletsUnchanged:true,receipt:paid.status===200?paid.data.receipt:null});
    report.status='passed';
  }catch(error){report.status='failed';report.error=String(error);throw error;}
  finally{
    clearInterval(timer);clearInterval(heartbeat);controller?.dispose();
    for(const [client,p] of proofs)await post(client,'/api/island/session/leave',{
      economy:context(p.origin),sessionId:p.sessionId,connectionGeneration:p.connectionGeneration,actionUid:uid()}).catch(()=>{});
    report.finishedAt=new Date().toISOString();await writeFile(outputDir+'/repair-wager-result.json',JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
