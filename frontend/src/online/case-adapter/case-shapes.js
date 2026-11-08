// Earned DTO boundary. Provenance: server game case_view/finale_view/npc_view/case_reveal serializers.
// Only declared display fields leave this module; partial or malformed snapshots never apply.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length <= 50000;
const number = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const boolean = value => typeof value === 'boolean';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const seat = value => Number.isInteger(value) && value >= 1 && value <= 4;
const oneOf = values => value => values.includes(value);
const optional = rule => ({optional:rule});
const nullable = rule => ({nullable:rule});
const list = rule => ({list:rule});
function copy(rule, value) {
  if (rule?.transform) return rule.transform(value);
  if (typeof rule === 'function') { if (!rule(value)) throw Error(); return value; }
  if (rule.nullable) return value === null ? null : copy(rule.nullable,value);
  if (rule.list) {
    if (!Array.isArray(value) || value.length > 1024) throw Error();
    return Array.from(value,item => copy(rule.list,item));
  }
  if (!object(value)) throw Error();
  const result = {};
  for (const [key,child] of Object.entries(rule)) {
    if (child.optional) { if (Object.hasOwn(value,key)) result[key]=copy(child.optional,value[key]); }
    else { if (!Object.hasOwn(value,key)) throw Error(); result[key]=copy(child,value[key]); }
  }
  return result;
}
const holder={seat,label:text};
const card={id,title:text,text,state:oneOf(['new','pinned','used']),holders:list(holder),
  pinnedBy:list({...holder,byPartner:boolean}),foundLine:text,foundSecond:integer,routeId:id,hotspot:id,canPin:boolean};
const deduction=value=>{
  const basic=copy({id,name:text,complete:boolean},value);
  return basic.complete ? {...basic,...copy({cards:list(id),finding:text,clears:nullable(text),
    clearLine:nullable(text),opens:list(text),opensLine:nullable(text)},value)} : basic;
};
// Tagged transforms are kept separate from predicate descriptors.
const transformed = transform => ({transform});
const route={id,kind:text,cardId:id,title:text,label:text,timerSeconds:integer,price:integer,
  kitName:nullable(text),canStart:boolean,reason:nullable(text),statusText:text,waitMinutes:integer};
const board={cards:list(card),leads:list({cardId:id,title:text,lead:text}),logLead:nullable(text),
  deductions:list(transformed(deduction)),suspects:list({id,title:text,cleared:boolean,clearedBy:nullable(text)}),canPair:boolean,pairWait:integer};
const search={spots:list({hotspot:id,place:text,routes:optional(list(route)),closedLine:optional(nullable(text)),line:optional(text)}),
  jobs:list({routeId:id,cardId:id,title:text,total:integer,remaining:integer,done:boolean,foundLine:nullable(text)})};
const accusation={schoonerFound:boolean,allowed:boolean,cooldown:integer,status:text,
  suspects:list({id,title:text,cleared:boolean}),evidence:list({id,name:text}),
  lastWrong:nullable({suspect:text,title:text,line:text,second:integer})};
const solvedCredit={seat,name:text,share:integer,paid:integer};
const reveal=value=>{
  const basic=copy({available:boolean},value);
  return basic.available ? {...basic,...copy({solvedSecond:integer,world:text,
    lines:list({id,kind:text,text,cites:list(id)}),credits:list(solvedCredit)},value)} : basic;
};
const point={x:number,y:number};
const finale={phase:oneOf(['waiting','night','dawn','success']),nightNo:integer,canCall:boolean,remaining:integer,
  dawnRemaining:integer,status:text,glow:nullable(point),parted:nullable({second:integer,lights:list(id),target:point}),
  lights:list({id,name:text,x:number,y:number,ready:boolean,partnersMayMan:boolean,
    post:nullable({seat,label:text,holder:oneOf(['player','partner']),onPost:boolean,remaining:integer}),
    lock:nullable({remaining:integer,aimedBySeat:seat}),lastBearing:nullable(number),canTake:boolean,canAim:boolean})};
const choice={id,label:text};
const partner={seat,name:text,partnerId:text,kit:text,kitName:text,status:oneOf(['idle','busy','on_duty']),canOrder:boolean,
  orders:list(choice),targets:{fetch:list(choice),man_light:list(choice)},satchel:list({id,title:text,pinned:boolean}),
  job:nullable({orderNo:integer,order:text,target:text,total:integer,remaining:integer,done:boolean,arrived:boolean,line:nullable(text)})};
const schema={caseId:id,writeRevision:integer,now:integer,minute:integer,
  crew:{id,status:text,mode:text,mySeat:seat,startedAt:text},
  seats:list({seatNo:seat,holder:oneOf(['player','partner']),name:text,kit:text,kitName:text,isMe:boolean}),
  me:{seatNo:seat,kit:text,readLog:boolean,coins:integer,timber:nullable(integer)},premise:text,question:text,board,search,accusation,
  reveal:transformed(reveal),credits:list({seat,name:text,isMe:boolean,pins:integer,deductionParts:integer,locks:integer,
    accused:boolean,share:nullable(integer),paid:nullable(integer)}),finale,partners:list(partner)};
const world={stage:oneOf(['dark','relit']),lightsOn:boolean,fogBankGone:boolean,gullsRestOpen:boolean,
  extraLights:integer,solves:integer,relitAt:nullable(text),wall:list({name:text,order:Number.isSafeInteger}),line:nullable(text)};
function validate(rule,value) { try { return {ok:true,value:value===null?null:copy(rule,value)}; } catch { return {ok:false}; } }
export const validateCase = value => validate(schema,value);
export function validateWorld(value) {
  const answer=validate(world,value);
  if (!answer.ok || answer.value===null) return answer;
  const view=answer.value,relit=view.stage==='relit';
  if (view.lightsOn!==relit || view.fogBankGone!==relit || view.gullsRestOpen!==relit
    || (relit ? (view.relitAt!==null&&!Number.isFinite(Date.parse(view.relitAt)))||view.line===null
      : view.relitAt!==null||view.wall.length>0||view.line!==null)
    ) return {ok:false};
  return answer;
}
