// Read-only host overview and checklist. Only explicit, safe API fields become screen text.
import { createPanel } from '../ui/kit/panel.js';
import { createTable } from '../ui/kit/table.js';
import { createButton } from '../ui/kit/button.js';
import { node } from '../ui/kit/dom.js';

export function tablePanel(title,columns,rows,note='') {
  const panel=createPanel({title});
  const scroll=node('div','host-table-scroll');scroll.tabIndex=0;
  scroll.setAttribute('role','region');scroll.setAttribute('aria-label',title);
  scroll.append(createTable({caption:title,columns,rows}).element);panel.body.append(scroll);
  if(note)panel.body.append(node('p','host-note',note));
  return panel.element;
}
// The "Game" counts of the v3 tables. Absent (null) until the owner applies 20261113030000_host_console_v3.sql.
const count=value=>Number.isInteger(value)&&value>=0?String(value):'Unknown';
export function gameLines(game) {
  if(!game)return null;
  return [['Islands',count(game.islands?.total)],['Islands opened today (UTC)',count(game.islands?.createdToday)],
    ['Games with friends aboard',count(game.games?.withMembers)],['Most players in one game',count(game.games?.maxMembers)],
    ['Waves running now',count(game.waves?.runningNow)],['Waves finished today (UTC)',count(game.waves?.finishedToday)],
    ['Best wave reached',count(game.waves?.bestWave)],
    ['Class code active',typeof game.demo?.codeActive==='boolean'?(game.demo.codeActive?'Yes':'No'):'Unknown'],
    ['Class guests admitted today (UTC)',count(game.demo?.guestsToday)]];
}
export function gamePanel(game) {
  const lines=gameLines(game);if(!lines)return null;
  const panel=createPanel({title:'Game'});panel.element.dataset.panel='game';
  const list=node('dl','host-counts');
  for(const [label,value] of lines)list.append(node('dt','',label),node('dd','',value));
  panel.body.append(list,node('p','host-note','Counts only: no names, ids or codes. Today means midnight to midnight UTC.'));
  return panel.element;
}
export function overviewPanels(data) {
  const result=[],summary=createPanel({title:'Game overview'});
  const list=node('dl','host-counts');
  for(const [label,value] of [['Players registered',data.players],['Forming crews',data.crews.forming],
    ['Active crews',data.crews.active],['Finished crews',data.crews.finished],
    ['Open market positions',data.openPositions??'Unknown'],
    ['Realtime connections',data.realtimeConnections??'Unknown: server has no count']]) {
    list.append(node('dt','',label),node('dd','',value));
  }
  summary.body.append(list,node('p','host-note',`Build ${data.build.version} · ${data.build.commit}`),
    node('p','host-note',`Weather: ${data.weather.source} · ${data.weather.origin} · ${data.weather.fetchedAt??'unknown time'}`));
  result.push(summary.element);
  const game=gamePanel(data.game);if(game)result.push(game);
  result.push(tablePanel(`Wallet movements · ${data.day} UTC`,[
    {key:'reason',label:'Reason'},{key:'count',label:'Moves'},{key:'earned',label:'Earned'},
    {key:'spent',label:'Spent'},{key:'net',label:'Net'},
  ],data.walletToday,'Today means midnight to midnight UTC. No movements means no rows. Counts include all crews.'));
  result.push(tablePanel('Expected migrations',[
    {key:'name',label:'Migration'},{key:'feature',label:'Feature'},{key:'state',label:'Required object'},
  ],data.expectedMigrations.map(m=>({...m,state:m.objectPresent?'Present':m.enabled?'MISSING':'Not enabled'})),
  'Object presence is a readiness probe, not proof of the exact applied migration version.'));
  return result;
}
// The class demo as plain lines. demo is {flagOn, code, codeSetAt, guests} from GET /api/host/demo.
const JOIN_BASE='https://the-great-plot-twist.vercel.app/?join=';
const CODE_SHAPE=/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
export function demoSummary(demo) {
  if(!demo||typeof demo.flagOn!=='boolean'||!Number.isInteger(demo.guests))
    return {flag:'Unknown',code:'Unknown: the demo status could not be read',link:'',guests:'Unknown'};
  const code=typeof demo.code==='string'&&CODE_SHAPE.test(demo.code)?demo.code:null;
  return {flag:demo.flagOn?'On':'Off (guests are refused)',
    code:code?`HARBOR-${code}`:'None yet: make one before class',link:code?`${JOIN_BASE}${code}`:'',
    guests:String(demo.guests)};
}
export function demoPanel(demo,handlers) {
  const panel=createPanel({title:'Class demo'});panel.element.dataset.panel='demo';
  const list=node('dl','host-counts'),flag=node('dd'),code=node('dd'),link=node('dd'),guests=node('dd');
  list.append(node('dt','','Demo feature flag'),flag,node('dt','','Class code'),code,node('dt','','Join link (the projector QR)'),link,
    node('dt','','Guests who joined with a code'),guests);
  panel.body.append(list,node('p','host-note','Anonymous sign-ins stay on in Supabase. A guest plays only after typing or scanning the current class code. A new code stops the old one at once for new joins; guests already in stay.'));
  const renewLabel=node('label','host-confirm'),renewBox=node('input');renewBox.type='checkbox';
  renewLabel.append(renewBox,document.createTextNode(' Replace the class code. The old code stops working for new joins.'));
  const renew=createButton({label:'New class code',onClick:()=>handlers.newCode(renewBox.checked)}).element;
  renew.disabled=true;renewBox.addEventListener('change',()=>{renew.disabled=busy||!renewBox.checked;});
  panel.body.append(renewLabel,renew);
  const label=node('label','host-confirm'),box=node('input');box.type='checkbox';
  label.append(box,document.createTextNode(' Delete guest accounts older than 24 hours. This cannot be undone.'));
  const clean=createButton({label:'Clean up guests',onClick:()=>handlers.cleanup(box.checked)}).element;
  clean.disabled=true;box.addEventListener('change',()=>{clean.disabled=busy||!box.checked;});
  panel.body.append(label,clean,node('p','host-note','Old guests are also removed automatically: each time this console or the projector reads the class code, at most every 10 minutes.'));
  let busy=false;
  function update(next) {
    const lines=demoSummary(next);flag.textContent=lines.flag;code.textContent=lines.code;link.textContent=lines.link||'None yet';
    guests.textContent=lines.guests;
  }
  update(demo);
  return {element:panel.element,update,
    busy(value) {busy=value;renew.disabled=value||!renewBox.checked;clean.disabled=value||!box.checked;},
    reset() {box.checked=false;clean.disabled=true;renewBox.checked=false;renew.disabled=true;},get isBusy() {return busy;}};
}
export function checklistPanel(data,headers) {
  const panel=createPanel({title:'Before the class demo'}),items=node('ul','host-checklist');
  const on=Object.entries(data.flags).filter(([,enabled])=>enabled).map(([name])=>name);
  for(const text of [
    data.keepalive.today?`Keep-alive confirmed today (UTC): ${data.keepalive.lastSuccessAt}`:
      `Keep-alive NOT confirmed today (UTC). Last: ${data.keepalive.lastSuccessAt??'no recorded success'}`,
    `Mode: ${data.demoMode?'recorded demo':'live services'}. Flags on: ${on.join(', ')||'none'}`,
    `Private API headers: ${headers.noStore&&headers.nosniff&&headers.noReferrer?'passed':'CHECK REQUIRED'}`,
    'This page uses a strict same-origin CSP; no inline scripts or styles.',
    'Rehearse sign-in, intro, a crew and the projector before inviting the class.',
  ])items.append(node('li','',text));
  const perf=node('a','','Open game performance check');perf.href='./?perf=1';
  const link=node('li');link.append(perf);items.append(link);panel.body.append(items);
  return panel.element;
}
