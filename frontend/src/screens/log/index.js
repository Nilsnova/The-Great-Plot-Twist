// Captain's Log is a read-only rendering of the supplied adapter model.
import './log.css';
import {node,restoreFocus} from '../helpers.js';
import {inspectionLabel} from '../inspection-labels.js';

function section(title,items,renderItem,empty){
  const area=node('section','captains-log-section'),heading=node('h4','',title);area.append(heading);
  if(items?.length){const list=node('ul','captains-log-list');for(const item of items){const row=node('li','');row.append(renderItem(item));list.append(row);}area.append(list);}
  else area.append(node('p','captains-log-empty',empty));
  return area;
}
function cardLine(card){
  const location=[card.where,card.place&&card.place!=='anywhere'?card.place:null].filter(Boolean).map(inspectionLabel).join(' · ');
  const meta=[Number.isFinite(card.seat)?`Seat ${card.seat}`:null,location,Number.isFinite(card.caseMinute)?`Case minute ${card.caseMinute}`:null].filter(Boolean).join(' · ');
  return entryLine(`${card.id} · ${card.title}`,'',meta);
}
function entryLine(title,text,meta=''){
  const line=node('p','captains-log-entry');line.append(node('strong','captains-log-entry-title',title));
  if(text)line.append(node('span','captains-log-entry-text',text));
  if(meta)line.append(node('span','captains-log-entry-meta',meta));return line;
}

export function createLogScreen({send,navigate}={}){
  void send;void navigate;
  const element=node('section','captains-log');element.setAttribute('aria-label','Captain’s Log');
  function update(view){
    const model=view?.log??view??{};
    restoreFocus(element,()=>{
      element.replaceChildren(node('h3','','Captain’s Log'));
      const intro=model.intro;
      if(intro){
        const record=node('section','captains-log-intro');record.append(node('h4','','The keeper’s last log'),node('p','',`${intro.ending} · ${intro.kit}`));
        record.append(node('p','captains-log-muted',intro.readLog?'You read Elena’s last entry during the intro.':'Elena’s last entry was not read during the intro.'));
        record.append(section('Your accepted choices',intro.actions,item=>node('p','',item.label), 'No intro choices recorded.'));element.append(record);
      }else element.append(node('p','captains-log-empty','Your crew’s discoveries and reports are collected here.'));
      element.append(section('Found cards',model.cards,item=>cardLine(item),'No cards have been recorded yet.'));
      element.append(section('Deductions',model.deductions,item=>entryLine(`${item.id} · ${item.title}`,'',item.cards.join(' + ')),'No deductions have been recorded yet.'));
      element.append(section('Partner reports',model.partnerReports,item=>entryLine(item.name,item.report,Number.isFinite(item.caseMinute)?`Case minute ${item.caseMinute}`:''),'No partner reports yet.'));
      element.append(section('Nights',model.nights,item=>entryLine(inspectionLabel(item.phase),item.report,[Number.isFinite(item.startedAt)?`Began at case minute ${item.startedAt}`:null,item.lights?.length?`Lights held: ${item.lights.join(', ')}`:null].filter(Boolean).join(' · ')),'No night has been recorded yet.'));
      if(model.observations?.length)element.append(section('At sea',model.observations,item=>node('p','',item.text),''));
      if(model.reveal?.length)element.append(section('The reveal',model.reveal,item=>entryLine(item.title,item.text,item.cites?.length?`Cards: ${item.cites.join(', ')}`:''),'The reveal remains sealed until the accepted solve.'));
      else element.append(node('p','captains-log-sealed','The reveal remains sealed until the accepted solve.'));
    });
  }
  return {element,update,tick(){},dispose(){element.remove();}};
}
