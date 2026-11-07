// Recorded L4-v2 answers compose the generated PKCE fixture; no vendor, account or database is contacted.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openAuthFixture} from './online-auth-fixture.js';

const companyId='recorded-market',stamp='2026-11-07T12:00:00Z';
const simulation='Simulation with play money. Recorded prices, no real money and no prizes.';
const recordedCredit={text:'Recorded market price source',href:'https://example.invalid/recorded-market-source'};
const copy=value=>structuredClone(value);
const keys=(value,expected)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===expected.slice().sort().join();
export async function openMarketFixture(){
 const env=await openAuthFixture(),{page}=env;
 try{
 const manifest=JSON.parse(await readFile('.test-cache/g9-online-dist/.vite/manifest.json','utf8'));
 const assets=new Set(Object.entries(manifest).filter(([key])=>key.startsWith('src/screens/market/'))
  .flatMap(([,chunk])=>[chunk.file,...(chunk.css??[])]).map(file=>'/'+file));
 assert.ok(assets.size>0,'The production manifest contains the adopted market entries.');
 let chunks=0,flag=true,tradingEnabled=true,coins=1000,positions=[],recentlyClosed=[],closed=false;
 // One recorded account owns its CAS across market-scenario reloads; resetMarket does not roll it back.
 let save={version:1,data:{kind:'world',actions:[],place:'saltreach_harbor'},updatedAt:stamp};
 const saveStats={reads:0,acceptedPuts:0,conflicts:0};
 let opens=0,closes=0,repeats=0,unknownApplied=false,sameUidRepeat=false;
 const receipts=new Map(),seen=new Map(),faults=[],ledgerReasons=[],requests=[],failures=[];
 const ledgerRows=[],ledgerStats={reads:0,lastRows:0,allGet:true,allAuthorized:true,allOwnUser:true,allExpectedQuery:true};
 const recordLedger=(delta,reason)=>ledgerRows.push({id:randomUUID(),player_id:env.fixtureUserId,delta,reason,
  created_at:new Date(Date.parse(stamp)+ledgerRows.length*1000).toISOString()});
 let allBodiesExpected=true,allPublicAnonymous=true,allPrivateAuthorized=true;
 const observe=request=>{if(assets.has(new URL(request.url()).pathname))chunks++;};
 page.on('request',observe);
 const company=()=>({id:companyId,name:'Recorded Company',ticker:'REC',kind:'island',follows:'Recorded reference',
  tagline:'Recorded company information.',market:'always',marketName:'Recorded market',currency:'USDT',priceDecimals:2,
  source:'cache',status:'open',reason:null,holiday:null,opensAt:null,closesAt:null,delisted:false,
  canOpen:tradingEnabled,canClose:tradingEnabled,price:100,priceAt:stamp,zeroPrices:{rising:90,falling:110}});
 const representativeStocks=()=>[
  {id:'recorded-us-closed',name:'Recorded Closed Stock',ticker:'CLS',status:'closed',reason:'weekend',price:25.5,
   opensAt:'2026-11-09T14:30:00Z'},
  {id:'recorded-us-stale',name:'Recorded Stale Stock',ticker:'STL',status:'stale',reason:'source_away',price:42.25,opensAt:null},
  {id:'recorded-us-unavailable',name:'Recorded Unavailable Stock',ticker:'NUL',status:'unavailable',reason:'no_price',price:null,opensAt:null},
 ].map(row=>({...company(),...row,kind:'stock',market:'us',marketName:'US stock market',currency:'USD',
  follows:'Recorded US shares',canOpen:false,canClose:false,zeroPrices:null,priceAt:null}));
 const board=()=>({generatedAt:stamp,demo:false,demoNote:null,tradingEnabled,relit:false,companies:[company(),...representativeStocks()],credits:[copy(recordedCredit)],simulationNote:simulation,
  rules:{leverage:10,zeroPointMovePercent:10,feePercent:2,minStake:10,maxStake:500,dailyStakeCap:2000,maxOpenPositions:20,
   stakeChoices:[{stake:10,fee:1,total:11}],tradePriceMaxAgeSeconds:5,tradesPer30Seconds:10,gameDayStarts:'08:00 Europe/Lisbon'}});
 const portfolio=()=>({coins,demo:false,feePercent:2,stakedToday:opens>1?20:opens?10:0,dailyStakeCap:2000,
  openCount:positions.length,maxOpenPositions:20,positions:copy(positions),recentlyClosed:copy(recentlyClosed),generatedAt:stamp});
 // C8's signed-in host reads this own-account baseline before an islet visit; use the same recorded wallet as me.
 const islet=()=>({coins,timber:0,signalStationBuilt:false,
  playMoneyNote:'Play money. No cash value. It cannot be bought or cashed out.',
  spots:[['plot_1','cabin','Cabin','built'],['plot_2','workshop','Workshop','empty'],
   ['plot_3','windmill','Windmill','locked'],['plot_4','greenhouse','Greenhouse','locked'],
   ['islet_signal_station','signal_station','Signal station','empty']].map(([plot,type,name,state])=>({plot,type,name,state,
    plotName:`Recorded ${name.toLowerCase()} plot`,about:'Recorded building information.',level:null,builtAt:null,
    cost:state==='built'?null:{coins:300,timber:10},missing:state==='empty'?['timber']:[],canBuild:false,
    lockedNote:state==='locked'?'This recorded plot opens later.':null}))});
 const resetMarket=({flag:nextFlag=true,tradingEnabled:trading=true}={})=>{
  flag=nextFlag;tradingEnabled=trading;coins=1000;positions=[];recentlyClosed=[];
  opens=closes=repeats=0;unknownApplied=sameUidRepeat=false;
  receipts.clear();seen.clear();faults.length=ledgerReasons.length=0;ledgerRows.length=0;ledgerStats.lastRows=0;
 };
 function apply(path,body){
  if(receipts.has(body.actionUid)){
   const previous=receipts.get(body.actionUid);
   if(previous.signature!==JSON.stringify(body))return{status:422,code:'validation_error'};
   repeats++;sameUidRepeat=true;return{status:409,code:'already_applied'};
  }
  if(path==='/api/market/open'){
   if(body.companyId!==companyId||!['rising','falling'].includes(body.side)||body.stake!==10)return{status:422,code:'validation_error'};
   const position={id:randomUUID(),companyId,name:'Recorded Company',ticker:'REC',follows:'Recorded reference',currency:'USDT',priceDecimals:2,
    side:body.side,mode:'live',stake:10,openFee:1,entryPrice:100,zeroPrice:body.side==='rising'?90:110,openedAt:stamp,
    price:100,priceAt:stamp,companyStatus:'open',companyReason:null,opensAt:null,value:10,profit:0,profitPercent:0,
    closeFee:1,wouldReceive:9,result:-2,canClose:true};
   positions.push(position);opens++;coins=closes?987:989;ledgerReasons.push('market_stake','market_fee');
   recordLedger(-10,'market_stake');recordLedger(-1,'market_fee');
   const data={positionId:position.id,companyId,side:body.side,stake:10,fee:1,coinsChange:-11,coins,
    entryPrice:100,zeroPrice:position.zeroPrice,feePercent:2,openedAt:stamp};
   receipts.set(body.actionUid,{signature:JSON.stringify(body)});return{status:200,data};
  }
  const index=positions.findIndex(position=>position.id===body.positionId);
  if(index<0)return{status:404,code:'no_such_position'};
  const [position]=positions.splice(index,1);closes++;coins=998;ledgerReasons.push('market_payout','market_fee');
  recordLedger(10,'market_payout');recordLedger(-1,'market_fee');
  recentlyClosed.push({...position,closedAs:'closed',closePrice:100,closedAt:stamp,closeFee:1,coinsChange:9});
  receipts.set(body.actionUid,{signature:JSON.stringify(body)});
  return{status:200,data:{positionId:position.id,closedAs:'closed',closePrice:100,value:10,fee:1,coinsChange:9,coins,closedAt:stamp}};
 }
 const fulfill=(route,reply)=>{
  if(reply.status>=400)failures.push({path:new URL(route.request().url()).pathname,status:reply.status});
  return route.fulfill({status:reply.status??200,headers:reply.status===429?{'Retry-After':'3'}:{},
   json:reply.data??{error:{code:reply.code,message:'Recorded market refusal.'}}});
 };
 const handler=async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
  const own=['/api/config','/api/me','/api/me/name','/api/save','/api/islet','/api/market','/api/market/portfolio','/api/market/open','/api/market/close'];
  if(!own.includes(path))return route.fallback();
  const authorized=Boolean(request.headers().authorization);
  if(path==='/api/config'){
   allPublicAnonymous&&=!authorized;
   return fulfill(route,{data:{flags:{sign_in:true,live_presence:false,market:flag,predictions:false,arena:false,case:false,bulletin:false},auth:{provider:'github'}}});
  }
  if(path==='/api/me')return fulfill(route,{data:{id:env.fixtureUserId,captainName:'Recorded Captain',displayName:'Recorded Captain',
   coins,crews:[],kit:'stranger',place:'saltreach_harbor'}});
  if(path==='/api/me/name')return fulfill(route,{data:{captainName:'Recorded Captain',rerollsLeft:1}});
  if(path==='/api/islet'){
   assert.equal(method,'GET','The recorded own-islet baseline is read only.');
   if(!authorized)return fulfill(route,{status:401,code:'unauthorized'});
   return fulfill(route,{data:islet()});
  }
  if(path==='/api/save'){
   if(!authorized)return fulfill(route,{status:401,code:'unauthorized'});
   if(method==='GET'){saveStats.reads++;return fulfill(route,{data:copy(save)});}
   assert.equal(method,'PUT','Recorded market saves use the published PUT route.');
   let body;try{body=request.postDataJSON();}catch{}
   assert.ok(keys(body,['version','data']),'A recorded market save sends only version and data.');
   assert.ok(Number.isInteger(body.version)&&body.version>0&&body.version<2147483647,
    'A recorded market save supplies a bounded server version.');
   assert.ok(keys(body.data,['kind','actions','place'])&&body.data.kind==='world'
    &&body.data.place==='saltreach_harbor'&&Array.isArray(body.data.actions)&&body.data.actions.length<=300
    &&body.data.actions.every(action=>typeof action==='string'&&/^[a-z0-9_]{1,40}$/.test(action))
    &&Buffer.byteLength(JSON.stringify(body.data))<=100000,'The market journey saves only its valid recorded harbor replay.');
   if(body.version!==save.version){saveStats.conflicts++;return fulfill(route,{status:409,code:'stale_save'});}
   save={version:save.version+1,data:copy(body.data),updatedAt:stamp};saveStats.acceptedPuts++;
   return fulfill(route,{data:copy(save)});
  }
  let body={};try{body=request.postDataJSON()??{};}catch{}
  const bodyKeys=Object.keys(body).sort(),signature=JSON.stringify(body),uid=body.actionUid;
  const uidValid=typeof uid==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(uid);
  const uidMatchesPrior=uidValid&&seen.get(uid)===signature;
  requests.push({path,method,authorized,bodyKeys,uidValid,uidMatchesPrior});
  if(path==='/api/market'){
   allPublicAnonymous&&=!authorized;
   assert.equal(method,'GET','The recorded public board is read only.');
   return fulfill(route,{data:board()});
  }
  allPrivateAuthorized&&=authorized;
  if(!authorized)return fulfill(route,{status:401,code:'unauthorized'});
  if(flag!==true)return fulfill(route,{status:404,code:'feature_off'});
  if(path==='/api/market/portfolio')return fulfill(route,{data:portfolio()});
  const expected=path.endsWith('/open')?['actionUid','companyId','side','stake']:['actionUid','positionId'];
  const allowed=method==='POST'&&uidValid&&JSON.stringify(bodyKeys)===JSON.stringify(expected);
  allBodiesExpected&&=allowed;
  if(!allowed)return fulfill(route,{status:422,code:'validation_error'});
  seen.set(uid,signature);
  const fault=faults[0]?.path===path?faults.shift():null;
  if(fault){if(fault.apply){apply(path,body);unknownApplied=true;}if(fault.status===0)return route.abort('failed');return fulfill(route,fault);}
  return fulfill(route,apply(path,body));
 };
 await page.route('**/api/**',handler);
 const ledgerPattern='https://placeholder.supabase.co/rest/v1/wallet_transactions**';
 const cors={'access-control-allow-origin':env.url,'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version'};
 const ledgerHandler=route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const get=request.method()==='GET',authorized=/^Bearer \S+$/.test(request.headers().authorization??'');
  const ownUser=url.searchParams.get('player_id')==='eq.'+env.fixtureUserId;
  const expectedQuery=url.pathname==='/rest/v1/wallet_transactions'
   &&url.searchParams.get('select')==='delta,reason,created_at'
   &&url.searchParams.get('order')==='created_at.desc'&&url.searchParams.get('limit')==='50'
   &&[...url.searchParams.keys()].sort().join()===['limit','order','player_id','select'].join();
  ledgerStats.reads++;ledgerStats.allGet&&=get;ledgerStats.allAuthorized&&=authorized;
  ledgerStats.allOwnUser&&=ownUser;ledgerStats.allExpectedQuery&&=expectedQuery;
  assert.ok(get&&authorized&&ownUser&&expectedQuery,'The own-ledger read uses GET, Bearer and only the recorded player filter.');
  // The real SDK selected these columns; generated row/player identifiers remain private fixture memory.
  const rows=[...ledgerRows].reverse().map(({delta,reason,created_at})=>({delta,reason,created_at}));
  ledgerStats.lastRows=rows.length;return route.fulfill({headers:cors,json:rows});
 };
 await page.route(ledgerPattern,ledgerHandler);
 const boundary=route=>{
  const url=new URL(route.request().url());
  return ['data:','blob:'].includes(url.protocol)||[env.url,'https://placeholder.supabase.co'].includes(url.origin)
   ?route.fallback():route.abort('blockedbyclient');
 };
 await page.route('**/*',boundary);
 return{...env,marketSimulationNote:simulation,marketRequests:requests,marketFailures:failures,resetMarket,
  marketSaveProof:()=>({...saveStats,version:save.version}),
  marketLedgerProof:()=>({...ledgerStats}),
  marketChunkCount:()=>chunks,
  faultMarket:(path,fault)=>{assert.ok(['/api/market/open','/api/market/close'].includes(path),'Faults target a published market write.');faults.push({path,...fault});},
  marketProof:()=>({opens,closes,repeats,unknownApplied,sameUidRepeat,ledgerReasons:[...ledgerReasons],
   allBodiesExpected,allPublicAnonymous,allPrivateAuthorized}),
  async assertPublicMarketPrice(){await page.waitForFunction(()=>
   document.querySelector('.market-card dd')?.textContent.startsWith('100.00 USDT'));return true;},
  async assertMarketBalance(){await page.waitForFunction(expected=>document.querySelector('.market-coins')?.textContent===expected,
   `You have ${coins.toLocaleString('en-GB')} coins`);return true;},
  async close(){
   if(closed)return;closed=true;page.off('request',observe);
   try{await page.unroute('**/*',boundary);await page.unroute(ledgerPattern,ledgerHandler);await page.unroute('**/api/**',handler);}finally{await env.close();}
  }};
 }catch(error){await env.close();throw error;}
}
