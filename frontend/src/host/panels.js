// Read-only host overview and checklist. Only explicit, safe API fields become screen text.
import { createPanel } from '../ui/kit/panel.js';
import { createTable } from '../ui/kit/table.js';
import { node } from '../ui/kit/dom.js';

export function tablePanel(title,columns,rows,note='') {
  const panel=createPanel({title});
  const scroll=node('div','host-table-scroll');scroll.tabIndex=0;
  scroll.setAttribute('role','region');scroll.setAttribute('aria-label',title);
  scroll.append(createTable({caption:title,columns,rows}).element);panel.body.append(scroll);
  if(note)panel.body.append(node('p','host-note',note));
  return panel.element;
}
export function overviewPanels(data) {
  const result=[],summary=createPanel({title:'Game overview'});
  const list=node('dl','host-counts');
  for(const [label,value] of [['Players registered',data.players],['Forming crews',data.crews.forming],
    ['Active crews',data.crews.active],['Finished crews',data.crews.finished],
    ['Open market positions',data.openPositions??'Unknown'],
    ['Realtime connections',data.realtimeConnections??'Unknown — server has no count']]) {
    list.append(node('dt','',label),node('dd','',value));
  }
  summary.body.append(list,node('p','host-note',`Build ${data.build.version} · ${data.build.commit}`),
    node('p','host-note',`Weather: ${data.weather.source} · ${data.weather.origin} · ${data.weather.fetchedAt??'unknown time'}`));
  result.push(summary.element);
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
