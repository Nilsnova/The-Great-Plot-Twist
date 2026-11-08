// Display translation of a fully validated server snapshot. No case decision runs here.
const clone = value => structuredClone(value);
const emptyWorld = () => ({stage:'dark',lightsOn:false,wall:[],festivalRemaining:0,canClaimLantern:false,colours:[],lanternColour:null});
const empty = () => ({now:0,board:{cards:[],deductions:[],suspects:[],leads:[],canPair:false,pairWait:0},
  search:{spots:[],routes:[],jobs:[],allowSpotPicker:false,activeSpot:null,label:'Your satchel',clockLabel:''},partners:[],
  finale:{phase:'waiting',lights:[],canCall:false,remaining:0,dawnRemaining:0,status:''},
  accusation:{allowed:false,schoonerFound:false,aboard:false,canBoard:false,suspects:[],evidence:[],cooldown:0,status:''},
  reveal:{available:false,lines:[],index:0,total:0,line:null,cards:[],done:false,canAdvance:false},
  world:emptyWorld(),rewards:{contributors:[]},log:{cards:[],deductions:[],partnerReports:[],nights:[],reveal:[]}});
const revealTitle = kind => ({closing:'Your voyage',last:'The coast',log:'The log',twist:'The finding',
  unmasking:'The reveal',evidence:'The evidence'})[kind] ?? 'The reveal';
export function projectWorld(world) {
  // The public DTO publishes no festival clock, colour grant or claim permission.
  return world ? {...clone(world),festivalRemaining:0,canClaimLantern:false,colours:[],lanternColour:null} : emptyWorld();
}
export function projectCase(snapshot,{activeSpot=null,revealIndex=0,aboard=false,world=null,elapsed=0}={}) {
  const result=empty();result.world=projectWorld(world);
  if (!snapshot) return result;
  const model=clone(snapshot),seconds=Number.isFinite(elapsed)?Math.max(0,Math.floor(elapsed)):0;
  const decrease=(row,key)=>{if(row&&Number.isFinite(row[key]))row[key]=Math.max(0,row[key]-seconds);};
  // Display clocks advance; server booleans, completion, locks and outcomes stay untouched.
  model.now+=seconds;model.minute=Math.floor(model.now/60);
  decrease(model.board,'pairWait');decrease(model.accusation,'cooldown');
  decrease(model.finale,'remaining');decrease(model.finale,'dawnRemaining');
  for(const light of model.finale.lights){decrease(light.post,'remaining');decrease(light.lock,'remaining');}
  for(const job of model.search.jobs)decrease(job,'remaining');
  for(const partner of model.partners)decrease(partner.job,'remaining');
  const board=model.board,found=new Map(board.cards.map(card=>[card.id,card]));
  result.now=model.now;
  result.board={...board,pairHelp:model.question,cards:board.cards.map(card=>({...card,body:card.text,canPair:board.canPair})),
    deductions:board.deductions.map(row=>({...row,title:row.name,clears:row.complete&&row.clears?[row.clears]:[],
      clearedTitles:row.complete&&row.clears ? board.suspects.filter(s=>s.id===row.clears).map(s=>s.title) : [],
      cards:row.complete?row.cards:[],opens:row.complete?row.opens:[]}))};
  const spot=model.search.spots.find(row=>row.hotspot===activeSpot),routes=spot?.routes??[];
  result.search={spots:model.search.spots.map(row=>({id:row.hotspot,label:row.hotspot})),activeSpot:spot?.hotspot??null,
    allowSpotPicker:false,label:spot?.line??spot?.closedLine??'Your satchel',clockLabel:`Case minute ${model.minute}`,
    routes:routes.map(route=>({...route,seconds:route.timerSeconds})),
    jobs:model.search.jobs.map((job,index)=>({...job,id:`${job.routeId}:${index}`,report:job.foundLine??''}))};
  // The wire supplies jobs and status, but no authoritative actor/chart coordinates.
  result.partners=model.partners.map(partner=>({...partner,archetype:partner.kit,
    job:partner.job?{...partner.job,report:partner.job.line}:null,
    life:{status:partner.status,event:null,chartLine:null,actor:null,post:null}}));
  result.finale={...model.finale,buildJobs:[],lights:model.finale.lights.map(light=>({...light,
    bearing:light.lastBearing,canBuild:false,buildLabel:'Open your islet',
    post:light.post?{...light.post,reserved:!light.post.onPost}:null}))};
  result.accusation={...model.accusation,aboard:aboard===true&&model.accusation.schoonerFound,
    canBoard:model.accusation.schoonerFound&&aboard!==true,
    evidence:model.accusation.evidence.map(row=>{const deduction=board.deductions.find(item=>item.id===row.id&&item.complete);
      return {...row,title:row.name,cards:(deduction?.cards??[]).filter(id=>found.has(id)).map(id=>({id,title:found.get(id).title}))};})};
  const lines=model.reveal.available?model.reveal.lines.map(line=>({...line,title:revealTitle(line.kind)})):[];
  const index=Math.max(0,Math.min(lines.length,Number.isSafeInteger(revealIndex)?revealIndex:0));
  result.reveal={...model.reveal,lines,index,total:lines.length,line:lines[index]??null,cards:board.cards.map(({id,title})=>({id,title})),
    done:model.reveal.available&&index===lines.length,canAdvance:model.reveal.available&&index<lines.length};
  result.rewards={contributors:model.credits};
  result.log={cards:board.cards.flatMap(card=>card.holders.map(holder=>({id:card.id,title:card.title,seat:holder.seat,
    where:card.hotspot,caseMinute:Math.floor(card.foundSecond/60)}))),
    deductions:board.deductions.filter(row=>row.complete).map(row=>({id:row.id,title:row.name,cards:row.cards})),
    partnerReports:model.partners.filter(row=>row.job?.line).map(row=>({id:`${row.seat}:${row.job.orderNo}`,name:row.name,report:row.job.line})),
    nights:model.finale.nightNo?[{phase:model.finale.phase,report:model.finale.status,lights:model.finale.parted?.lights??[]}]:[],
    reveal:lines};
  return result;
}

export const mapCaseView=projectCase;
export const mapWorldView=projectWorld;
