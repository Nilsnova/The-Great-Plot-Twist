// Production A2 sign-in plus authoritative recorded islet answers; every endpoint is intercepted.
import assert from 'node:assert/strict';
import {openAuthFixture} from './online-auth-fixture.js';

const copy=value=>structuredClone(value);
const keys=(value,expected)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===expected.slice().sort().join();
const price={coins:300,timber:10};
const catalogue=[
  {plot:'plot_1',plotName:'Cabin plot',type:'cabin',name:'Cabin',state:'built'},
  {plot:'plot_2',plotName:'Workshop plot',type:'workshop',name:'Workshop',state:'empty'},
  {plot:'plot_3',plotName:'Windmill plot',type:'windmill',name:'Windmill',state:'locked'},
  {plot:'plot_4',plotName:'Greenhouse plot',type:'greenhouse',name:'Greenhouse',state:'locked'},
  {plot:'islet_signal_station',plotName:'Islet signal station',type:'signal_station',name:'Signal station',state:'empty'},
];
export async function openIsletFixture(){
  const env=await openAuthFixture(),{page}=env;
  const ledger=[],controlledResponses=[],applied=new Map(),previousUid=new Map(),readFaults=[],buildFaults=[],holds=new Set();
  let coins=1000,timber=20,charges=0,buildings=new Map(),denied=null;
  // The same recorded account survives scenario reloads; save CAS is independent of build resets.
  let save={version:1,data:{kind:'world',actions:['to_desk'],place:'home_islet'},updatedAt:null};
  const saveStats={reads:0,acceptedPuts:0,conflicts:0};
  function snapshot(){return {coins,timber,signalStationBuilt:buildings.has('islet_signal_station'),
    playMoneyNote:'Play money. No cash value. It cannot be bought or cashed out.',
    spots:catalogue.map(item=>{
      const building=buildings.get(item.plot),built=item.state==='built'||!!building,locked=item.state==='locked';
      return {...item,state:built?'built':item.state,about:'Recorded building information.',
        level:building?1:null,builtAt:building?.at??null,cost:built?null:copy(price),
        missing:[],canBuild:!built&&!locked,lockedNote:locked?'This recorded plot opens later.':null};
    })};}
  function reset(){coins=1000;timber=20;charges=0;buildings=new Map();applied.clear();previousUid.clear();
    readFaults.length=0;buildFaults.length=0;denied=null;}
  const audit=request=>{
    const path=new URL(request.url()).pathname;if(!path.startsWith('/api/islet'))return;
    let body;try{body=request.postDataJSON();}catch{}
    let match=false;
    if(request.method()==='POST'&&typeof body?.plot==='string'&&typeof body.actionUid==='string'){
      const previous=previousUid.get(body.plot);match=previous!==undefined&&previous===body.actionUid;
      previousUid.set(body.plot,body.actionUid);
    }
    ledger.push({method:request.method(),path,bodyKeys:Object.keys(body??{}).sort(),actionUidMatchesPrevious:match});
  };
  page.on('request',audit);
  async function failure(route,{status,code='database_unavailable'}){
    controlledResponses.push({method:route.request().method(),path:new URL(route.request().url()).pathname,status});
    if(status===0)return route.abort('failed');
    return route.fulfill({status,headers:status===429?{'Retry-After':'3'}:{},
      json:{error:{code,message:status===503?'Recorded service unavailable.':'Recorded islet refusal.'}}});
  }
  function receipt(body){
    const item=catalogue.find(item=>item.plot===body.plot);
    assert.ok(item&&item.type===body.type,'A build repeats the exact plot/type supplied by its server card');
    assert.ok(item.state==='empty','The recorded request targets an available plot');
    if(applied.has(body.actionUid))return null;
    assert.ok(!buildings.has(item.plot),'A new UID cannot silently charge an already built plot');
    assert.ok(coins>=300&&timber>=10,'The recorded server has enough materials for this one build');
    coins-=300;timber-=10;charges+=1;
    buildings.set(item.plot,{at:new Date().toISOString()});
    const data={plot:item.plot,type:item.type,name:item.name,level:1,coinsPaid:300,timberPaid:10,coins,timber};
    applied.set(body.actionUid,copy(data));return data;
  }
  const handler=async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
    if(!['/api/me','/api/save','/api/islet','/api/islet/build'].includes(path))return route.fallback();
    assert.ok(request.headers().authorization,'Own-account and islet reads use the generated A2 session');
    if(path==='/api/me'){
      if(method!=='GET')return route.fallback();
      return route.fulfill({json:{id:env.fixtureUserId,captainName:'Recorded Captain',coins,crews:[],kit:'witness',place:'home_islet'}});
    }
    if(path==='/api/save'){
      if(method==='GET'){saveStats.reads+=1;return route.fulfill({json:copy(save)});}
      assert.equal(method,'PUT','Recorded saves use the published PUT route');
      let body;try{body=request.postDataJSON();}catch{}
      assert.ok(keys(body,['version','data']),'A recorded save sends only version and data');
      assert.ok(Number.isInteger(body.version)&&body.version>0&&body.version<2147483647,
        'A recorded save supplies a bounded server version');
      assert.ok(keys(body.data,['kind','actions','place'])&&body.data.kind==='world'
        &&['home_islet','saltreach_harbor'].includes(body.data.place)&&Array.isArray(body.data.actions)&&body.data.actions.length<=300
        &&body.data.actions.every(action=>typeof action==='string'&&/^[a-z0-9_]{1,40}$/.test(action))
        &&Buffer.byteLength(JSON.stringify(body.data))<=100000,'The islet journey saves only its valid recorded chart-route replay');
      if(body.version!==save.version){saveStats.conflicts+=1;return failure(route,{status:409,code:'stale_save'});}
      save={version:save.version+1,data:copy(body.data),updatedAt:new Date().toISOString()};saveStats.acceptedPuts+=1;
      return route.fulfill({json:copy(save)});
    }
    if(path==='/api/islet'){
      assert.equal(method,'GET');const fault=readFaults.shift();
      return fault?failure(route,fault):route.fulfill({json:snapshot()});
    }
    assert.equal(method,'POST');const body=request.postDataJSON();
    assert.ok(body&&Object.keys(body).sort().join()==='actionUid,plot,type','A build sends only plot, type and actionUid');
    assert.ok(typeof body.actionUid==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(body.actionUid),'The runtime-generated build UID has the public shape');
    if(denied)return failure(route,denied);
    const hold=[...holds].find(value=>!value.used);
    if(hold){hold.used=true;hold.startedResolve();await hold.released;}
    const fault=buildFaults.shift();
    if(fault){
      if(fault.apply)receipt(body);
      if(fault.readbackStatus!==undefined)readFaults.push({status:fault.readbackStatus,code:'database_unavailable'});
      return failure(route,fault);
    }
    if(applied.has(body.actionUid)){
      const first=applied.get(body.actionUid);
      assert.ok(first.plot===body.plot&&first.type===body.type,'A repeated UID retains its original plot and type');
      return failure(route,{status:409,code:'already_applied'});
    }
    return route.fulfill({json:receipt(body)});
  };
  await page.route('**/api/**',handler);
  return {...env,isletRequests:ledger,controlledIsletResponses:controlledResponses,
    resetIslet:reset,isletStats:()=>({coins,timber,charges,builtCount:buildings.size}),
    isletSaveStats:()=>({...saveStats,version:save.version}),
    faultNextBuild(options){buildFaults.push({...options});},
    denyBuilds(status=401,code='unauthorized'){denied={status,code};},
    holdNextBuild(){
      let startedResolve,release;
      const started=new Promise(resolve=>{startedResolve=resolve;}),released=new Promise(resolve=>{release=resolve;});
      const hold={used:false,startedResolve,released,release};holds.add(hold);
      return {started,release(){release();holds.delete(hold);}};
    },
    async close(){for(const hold of holds)hold.release();holds.clear();page.off('request',audit);await env.close();},
  };
}
