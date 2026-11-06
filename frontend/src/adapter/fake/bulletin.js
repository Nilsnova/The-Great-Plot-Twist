// Deterministic bulletin rehearsal data; no server-only story text or hook wording.
import {fakeHook} from './hook.js';
export const bulletinScenarioIds=['calm','real','almanac','storm','relit','hook','stale','missing-tonight','loading','unavailable','off'];
const scenarios=new Set(bulletinScenarioIds);
export const canonicalBulletinCopy={
  stateWords:{storm:'storm',fog:'fog',rain:'rain',calm:'calm and clear'},noForecast:'no forecast',
  weatherLine:'Tonight: {tonight}. Tomorrow: {tomorrow}.',
  fogNightLines:{real:'Fog tonight. Watch for the false light.',almanac:"The harbor's almanac calls fog tonight. Watch for the false light."},
  exchange:{feedWords:{live:'live',cache:'recent prices',stale:'old prices (trading paused)',replay:'replay'},allOpen:'Island Exchange: {feed}. No company is paused.',somePaused:'Island Exchange: {feed}. Paused: {companies}.'},
  relitLine:'The coast is relit. The false light is out. A crew found it.',relitLineHours:48,
  calendar:[{on:'2026-11-16',text:'Day 1. From today the harbor bulletin comes out every morning at 8.'}],
  resets:[{when:'Every day at 00:00',what:'A new game day begins.'},{when:'Every day at 08:00',what:'The harbor bulletin is published.'},{when:'Every Monday at 00:00',what:'A new harbor week begins.'},{when:'Never',what:'Coins, buildings, shares and titles never reset.'}],
};
const utcDate=(year,month,day)=>new Date(Date.UTC(year,month-1,day));
function dateString(date){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;}
function addDays(value,count){const [year,month,day]=value.split('-').map(Number);return dateString(utcDate(year,month,day+count));}
function lisbonParts(ms){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
  return Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
}
function instantAtLisbon(date,hour,minute=0){
  const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
  for(let i=0;i<3;i++){const p=lisbonParts(guess),local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);guess+=target-local;}
  return new Date(guess).toISOString();
}
function day(baseMs){
  const today=lisbonParts(baseMs),id=dateString(utcDate(today.year,today.month,today.day));
  const bulletinDay=today.hour>=8?id:addDays(id,-1);
  const weekday=utcDate(today.year,today.month,today.day).getUTCDay(),monday=addDays(id,-((weekday+6)%7));
  return {id,startedAt:instantAtLisbon(id,0),nextDayAt:instantAtLisbon(addDays(id,1),0),bulletinDay,
    publishedAt:instantAtLisbon(bulletinDay,8),nextBulletinAt:new Date(baseMs+15*60_000).toISOString(),harborWeek:monday,
    nextHarborWeekAt:instantAtLisbon(addDays(monday,7),0),resets:canonicalBulletinCopy.resets.map(item=>({...item}))};
}
function night(baseMs,tonightState,isNow,isFogNight=false,fogNightKind=null){
  const startsMs=baseMs+(isNow?-5:7)*60_000,endsMs=baseMs+(isNow?7:19)*60_000;
  const p=lisbonParts(startsMs);
  return {date:dateString(utcDate(p.year,p.month,p.day)),
    startsAt:new Date(startsMs).toISOString(),endsAt:new Date(endsMs).toISOString(),isNow,state:tonightState,isFogNight,fogNightKind};
}
function weather(baseMs,tonightState,isNow,isFogNight=false,fogNightKind=null){
  const current=night(baseMs,tonightState,isNow,isFogNight,fogNightKind),tomorrowStart=Date.parse(current.endsAt)+60_000,tomorrowEnd=tomorrowStart+12*60_000;
  const p=lisbonParts(tomorrowStart),tomorrow={date:dateString(utcDate(p.year,p.month,p.day)),startsAt:new Date(tomorrowStart).toISOString(),endsAt:new Date(tomorrowEnd).toISOString(),state:'calm'};
  return {tonight:current,tomorrow,source:'fallback',fetchedAt:new Date(baseMs).toISOString(),attribution:'Weather data by Open-Meteo.com, adapted for the game'};
}
export function initialBulletinState(nowMs=Date.now()){return {scenario:'off',baseMs:nowMs};}
export function setBulletinScenario(state,scenario,nowMs=Date.now()){if(!scenarios.has(scenario)||!Number.isFinite(nowMs))return false;state.bulletinScenario=scenario;state.bulletinBaseMs=nowMs;return true;}
export function bulletinView(state){
  const scenario=state.bulletinScenario??state.bulletin?.scenario??state.scenario??'off';
  if(scenario==='off')return {status:'off',day:null,lines:[],weather:null,exchange:null,chapterTwoHook:null};
  if(scenario==='loading')return {status:'loading',day:null,lines:[],weather:null,exchange:null,chapterTwoHook:null};
  if(scenario==='unavailable')return {status:'unavailable',day:null,lines:[],weather:null,exchange:null,chapterTwoHook:null};
  const baseMs=Number.isFinite(state.bulletinBaseMs)?state.bulletinBaseMs:Number.isFinite(state.bulletin?.baseMs)?state.bulletin.baseMs:Number.isFinite(state.baseMs)?state.baseMs:0;
  const fog=['real','almanac'].includes(scenario),isNow=['real','storm'].includes(scenario),weatherState=scenario==='storm'?'storm':scenario==='real'?'fog':'calm';
  const forecast=weather(baseMs,weatherState,isNow,fog,scenario==='real'?'real':scenario==='almanac'?'almanac':null),today=day(baseMs);
  const missingTonight=scenario==='missing-tonight',tonight=missingTonight?{...forecast,tonight:null}:forecast;
  const tomorrow=forecast.tomorrow.state,words=canonicalBulletinCopy.stateWords;
  const lines=[{kind:'weather',text:canonicalBulletinCopy.weatherLine.replace('{tonight}',missingTonight?canonicalBulletinCopy.noForecast:words[weatherState]).replace('{tomorrow}',words[tomorrow])}];
  if(fog)lines.push({kind:'fog',text:canonicalBulletinCopy.fogNightLines[scenario==='real'?'real':'almanac']});
  let exchange=null,chapterTwoHook=null;
  if(scenario==='calm'){exchange={feed:'live',pausedCompanies:[]};lines.push({kind:'exchange',text:canonicalBulletinCopy.exchange.allOpen.replace('{feed}',canonicalBulletinCopy.exchange.feedWords.live)});}
  if(scenario==='stale'){const company={id:'harbor-trust',name:'Saltreach Harbor Trust'};exchange={feed:'stale',pausedCompanies:[company]};lines.push({kind:'exchange',text:canonicalBulletinCopy.exchange.somePaused.replace('{feed}',canonicalBulletinCopy.exchange.feedWords.stale).replace('{companies}',company.name)});}
  if(scenario==='relit')lines.push({kind:'relit',text:canonicalBulletinCopy.relitLine});
  if(scenario==='hook'){chapterTwoHook=fakeHook();lines.push({kind:'hook',text:'[bulletin line supplied by the server]'});}
  const calendar=canonicalBulletinCopy.calendar.find(item=>item.on===today.bulletinDay);if(calendar)lines.push({kind:'calendar',text:calendar.text});
  return {status:'ready',day:today,lines,weather:tonight,exchange,chapterTwoHook};
}
