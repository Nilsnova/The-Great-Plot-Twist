// Production-only intercepted case responses. No real account, content case or service is read.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openCrewPresenceFixture} from './online-crew-presence-fixture.js';
const world=()=>({stage:'dark',lightsOn:false,fogBankGone:false,gullsRestOpen:false,extraLights:0,solves:0,relitAt:null,wall:[],line:null});
const title=id=>`Recorded earned card ${id}`;
const holder=seat=>({seat:seat.seatNo,label:seat.name});
export function recordedCaseSnapshot(crew,{stage='earned',progress={},worldLocked=false}={}){
  if(!crew||crew.status!=='active')return null;
  const own=crew.seats.find(seat=>seat.isMe),paired=stage==='paired',searched=progress.search==='done';
  const cards=(searched?['C1','C2','C3']:['C1','C2']).map(id=>({id,title:title(id),text:`Supplied earned text for ${id}.`,
    state:paired&&id!=='C3'?'used':stage==='pinned'&&id==='C1'?'pinned':'new',holders:[holder(own)],
    pinnedBy:paired&&id!=='C3'||stage==='pinned'&&id==='C1'?[{...holder(own),byPartner:false}]:[],
    foundLine:'Supplied discovery report.',foundSecond:10,routeId:`${id}.recorded`,hotspot:'saltreach_harbor.ferry_pier',canPin:!paired&&!(stage==='pinned'&&id==='C1')}));
  const success=progress.night==='success',night=progress.night==='night',solved=progress.reveal===true;
  const lights=['keepers_lamp','harbor_light','islet_signal_station'].map((id,index)=>({id,name:`Recorded light ${index+1}`,x:[90,210,300][index],y:100,
    ready:true,partnersMayMan:index!==2,post:progress.post||success?{seat:index===0?1:index+2,label:`Recorded post ${index+1}`,holder:index===0?'player':'partner',onPost:true,remaining:0}:null,
    lock:success?{remaining:90,aimedBySeat:1}:null,lastBearing:index===0&&success?1:null,canTake:night&&!progress.post,canAim:night&&progress.post===true&&index===0}));
  const lines=[{id:'recorded_evidence',kind:'evidence',text:'Supplied reveal evidence.',cites:['C1']},
    {id:'recorded_last',kind:'last',text:'Supplied final reveal line.',cites:[]}];
  return {caseId:'recorded_case',writeRevision:progress.revision??(paired?4:stage==='pinned'?3:2),now:60,minute:1,
    crew:{id:crew.id,status:'active',mode:crew.mode,mySeat:crew.mySeat,startedAt:crew.startedAt},
    seats:crew.seats.map(seat=>({seatNo:seat.seatNo,holder:seat.holder,name:seat.name,kit:seat.kit,kitName:'Recorded kit',isMe:seat.isMe})),
    me:{seatNo:own.seatNo,kit:own.kit,readLog:false,coins:0,timber:0},premise:'Supplied case premise.',question:'Supplied case question.',
    board:{cards,leads:[],logLead:null,deductions:[paired?{id:'D1',name:'Recorded server deduction',complete:true,cards:['C1','C2'],
      finding:'Supplied server finding.',clears:null,clearLine:null,opens:[],opensLine:null}:{id:'D1',name:'Recorded server deduction',complete:false}],
      suspects:[{id:'recorded_suspect',title:'Recorded suspect',cleared:false,clearedBy:null}],canPair:!paired,pairWait:0},
    search:{spots:[{hotspot:'saltreach_harbor.ferry_pier',place:'saltreach_harbor',line:'Supplied pier report.',routes:[{
      id:'C3.recorded',kind:'open',cardId:'C3',title:title('C3'),label:'Recorded free route',timerSeconds:60,price:0,kitName:null,
      canStart:!progress.search,reason:progress.search?'already_have':null,statusText:progress.search?'Supplied completed search status.':'Supplied ready search status.',waitMinutes:0}]}],
      jobs:progress.search?[{routeId:'C3.recorded',cardId:'C3',title:title('C3'),total:60,remaining:searched?0:1,done:searched,foundLine:searched?'Supplied completed search report.':null}]:[]},
    accusation:{schoonerFound:success,allowed:success&&!solved,cooldown:0,status:'Supplied accusation status.',suspects:[{id:'recorded_suspect',title:'Recorded suspect',cleared:false}],
      evidence:paired?[{id:'D1',name:'Recorded server deduction'}]:[],lastWrong:progress.refused?{suspect:'recorded_suspect',title:'Recorded suspect',line:'Supplied refusal line.',second:60}:null},
    reveal:solved?{available:true,solvedSecond:60,world:worldLocked?'locked':'unchanged',lines,credits:[{seat:1,name:'Recorded Captain',share:0,paid:0}]}:{available:false},credits:[],
    finale:{phase:success?'success':night?'night':'waiting',nightNo:night||success?1:0,canCall:progress.night==='ready',remaining:night?60:0,dawnRemaining:0,
      status:'Supplied night status.',glow:night?{x:120,y:130}:null,parted:success?{second:60,lights:lights.map(light=>light.id),target:{x:120,y:130}}:null,lights},
    partners:crew.seats.filter(seat=>seat.holder==='partner').map((seat,index)=>({seat:seat.seatNo,name:seat.name,partnerId:seat.partnerId,kit:seat.kit,kitName:'Recorded kit',
      status:index===0&&progress.partner==='working'?'busy':'idle',canOrder:!(index===0&&progress.partner==='working'),orders:[{id:'fetch',label:'Recorded fetch order'}],
      targets:{fetch:[{id:'C3',label:title('C3')}],man_light:[]},satchel:index===0&&progress.partner==='done'?[{id:'C3',title:title('C3'),pinned:true}]:[],
      job:index===0&&progress.partner?{orderNo:1,order:'fetch',target:'C3',total:60,remaining:progress.partner==='done'?0:1,done:progress.partner==='done',arrived:progress.partner==='done',line:progress.partner==='done'?'Supplied partner completion.':'Supplied partner departure.'}:null}))};
}
// Pure factory is usable by injected unit tests; credentials and sealed case content are absent.
export function createCaseFixture({crew,stage='earned',progress={},worldLocked=false}={}){
  const activeCrew=crew??{id:randomUUID(),status:'active',mode:'crew',mySeat:1,startedAt:'2026-11-08T00:00:00Z',
    seats:[1,2,3,4].map(seatNo=>({seatNo,holder:seatNo<3?'player':'partner',isMe:seatNo===1,
      name:`Recorded seat ${seatNo}`,kit:seatNo===1?'stranger':seatNo===2?'witness':'informant',
      partnerId:seatNo<3?null:randomUUID()}))};
  return recordedCaseSnapshot(activeCrew,{stage,progress,worldLocked});
}
export async function openCaseFixture({worldLocked=false}={}){
  const env=await openCrewPresenceFixture({startPlace:'saltreach_harbor'}),requests=[],previous=new Map();
  let stage='earned',sequence=0,nextPinAbort=false,progress={},accusations=0;
  const security={enforcingDocuments:0,missingEnforcingPolicy:0,violations:0};
  env.page.on('response',response=>{if(!response.request().isNavigationRequest()||response.frame()!==env.page.mainFrame()||new URL(response.url()).origin!==env.url)return;
    if(response.headers()['content-security-policy'])security.enforcingDocuments++;else security.missingEnforcingPolicy++;});
  env.page.on('console',message=>{if(message.type()==='error'&&message.text()==='[recorded case CSP violation]')security.violations++;});
  try{
    await env.page.addInitScript(()=>document.addEventListener('securitypolicyviolation',()=>console.error('[recorded case CSP violation]')));
    await env.page.route('**/api/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
      if(path==='/api/config'){
        assert.equal(request.headers().authorization,undefined,'Config stays anonymous');
        return route.fulfill({json:{flags:{sign_in:true,live_presence:false,market:false,predictions:false,arena:false,case:true,bulletin:false},auth:{provider:'github'}}});
      }
      if(!['/api/case','/api/world','/api/board/pin','/api/board/pair','/api/case/search','/api/crews/me/orders',
        '/api/finale/nightfall','/api/finale/post','/api/finale/signal','/api/case/accuse'].includes(path))return route.fallback();
      const authorized=/^Bearer \S+$/.test(request.headers().authorization??'');
      assert.equal(authorized,path!=='/api/world','Only public world reads omit the generated bearer');
      let body;try{body=request.postDataJSON();}catch{}
      const uid=body?.actionUid,serialized=body===undefined?null:JSON.stringify(body),key=method+':'+path,prior=previous.get(key);
      requests.push({sequence:++sequence,path,method,authorized,bodyKeys:Object.keys(body??{}).sort(),uidPresent:typeof uid==='string',
        sameUid:prior?typeof uid==='string'&&uid===prior.uid:null,sameBody:prior?serialized===prior.serialized:null});
      if(method==='GET'){
        assert.equal(request.postData(),null,'Case and world reads carry no body');
        if(path==='/api/case'&&progress.search==='working')progress={...progress,search:'done',revision:6};
        if(path==='/api/case'&&progress.partner==='working')progress={...progress,partner:'done',night:'ready',revision:8};
        const coast=progress.reveal&&!worldLocked?{...world(),stage:'relit',lightsOn:true,fogBankGone:true,gullsRestOpen:true,solves:1,
          relitAt:'2026-11-08T00:01:00Z',wall:[{name:'Recorded Captain',order:1}],line:'Supplied public coast line.'}:world();
        return route.fulfill({json:path==='/api/world'?coast:{case:recordedCaseSnapshot(env.crewSnapshot(),{stage,progress,worldLocked})}});
      }
      assert.equal(method,'POST');assert.match(uid,/^[A-Za-z0-9_-]{8,64}$/);
      previous.set(key,{uid,serialized});
      let accepted=true,reason=null,message='Recorded server confirmation.';
      if(path==='/api/board/pin'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','cardId']);assert.equal(body.cardId,'C1');
        if(nextPinAbort){nextPinAbort=false;return route.abort('failed');}stage='pinned';
      }else if(path==='/api/board/pair'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','cards']);assert.deepEqual(body.cards,['C1','C2']);stage='paired';
      }else if(path==='/api/case/search'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','expectedPrice','paidConfirmed','routeId']);
        assert.equal(body.routeId,'C3.recorded');assert.equal(body.expectedPrice,0);assert.equal(body.paidConfirmed,false);
        progress={...progress,search:'working',revision:5};
      }else if(path==='/api/crews/me/orders'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','allowPaid','order','seat','target']);
        assert.equal(body.seat,3);assert.equal(body.order,'fetch');assert.equal(body.target,'C3');assert.equal(body.allowPaid,false);
        progress={...progress,partner:'working',revision:7};
      }else if(path==='/api/finale/nightfall'){
        assert.deepEqual(Object.keys(body),['actionUid']);progress={...progress,night:'night',revision:9};
      }else if(path==='/api/finale/post'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','light']);assert.equal(body.light,'keepers_lamp');
        progress={...progress,post:true,revision:10};
      }else if(path==='/api/finale/signal'){
        assert.deepEqual(Object.keys(body).sort(),['actionUid','bearing','light']);assert.equal(body.light,'keepers_lamp');assert.equal(body.bearing,1);
        progress={...progress,night:'success',revision:11};
      }else{
        assert.deepEqual(Object.keys(body).sort(),['actionUid','suspect']);assert.equal(body.suspect,'recorded_suspect');accusations++;
        if(accusations===1){accepted=false;reason='accusation_refused';message='Recorded server accusation refusal.';progress={...progress,refused:true,revision:12};}
        else if(accusations===2)return route.abort('failed');
        else progress={...progress,reveal:true,revision:13};
      }
      return route.fulfill({json:{accepted,reason,message,case:recordedCaseSnapshot(env.crewSnapshot(),{stage,progress,worldLocked})}});
    });
    return {...env,caseRequests:requests,caseSecurity:()=>({...security}),abortNextPin(){nextPinAbort=true;},resetCase(){stage='earned';progress={};accusations=0;previous.clear();}};
  }catch(error){await env.close();throw error;}
}
export function assertCasePrivacy(env){
  const security=env.caseSecurity();assert.ok(security.enforcingDocuments>0&&security.missingEnforcingPolicy===0,'Case documents retain enforcing CSP');
  assert.equal(security.violations,0,'Case journeys emit no CSP violation');assert.equal(env.pageErrors.length,0,'Case journeys have no page errors');
  assert.ok(env.consoleErrors.every(error=>error.resource),'Case journeys have no non-resource console error');
  assert.ok(env.external.every(value=>new URL(value).origin==='https://placeholder.supabase.co'),'Only intercepted placeholder account origins are requested');
}
