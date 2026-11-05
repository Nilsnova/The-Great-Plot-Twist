// Captain's Log is a read-only rendering of the supplied adapter model.
import './log.css';
import {node,restoreFocus} from '../helpers.js';

function section(title,items,renderItem,empty){
  const area=node('section','captains-log-section'),heading=node('h4','',title);area.append(heading);
  if(items?.length){const list=node('ul','captains-log-list');for(const item of items){const row=node('li','');row.append(renderItem(item));list.append(row);}area.append(list);}
  else area.append(node('p','captains-log-empty',empty));
  return area;
}
function cardLine(card){
  const location=[card.where,card.place&&card.place!=='anywhere'?card.place:null].filter(Boolean).join(' · ')||'Location not recorded';
  const when=Number.isFinite(card.caseMinute)?`Case minute ${card.caseMinute}`:'Time not recorded';
  return node('p','',`${card.id} · ${card.title} · Seat ${card.seat} · ${location} · ${when}`);
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
      }else element.append(node('p','captains-log-empty','Finish the original intro to begin your Captain’s Log.'));
      element.append(section('Found cards',model.cards,item=>cardLine(item),'No cards have been recorded yet.'));
      element.append(section('Deductions',model.deductions,item=>node('p','',`${item.id} · ${item.title} · ${item.cards.join(' + ')}`),'No deductions have been recorded yet.'));
      element.append(section('Partner reports',model.partnerReports,item=>node('p','',`${item.name} · ${item.report}${Number.isFinite(item.caseMinute)?` · Case minute ${item.caseMinute}`:''}`),'No partner reports yet.'));
      element.append(section('Nights',model.nights,item=>node('p','',`${item.phase} · ${item.report}${Number.isFinite(item.startedAt)?` · Began at case minute ${item.startedAt}`:''}${item.lights?.length?` · Lights held: ${item.lights.join(', ')}`:''}`),'No night has been recorded yet.'));
      if(model.reveal?.length)element.append(section('The reveal',model.reveal,item=>node('p','',`${item.title} · ${item.text}${item.cites?.length?` · Cards: ${item.cites.join(', ')}`:''}`),'The reveal remains sealed until the accepted solve.'));
      else element.append(node('p','captains-log-sealed','The reveal remains sealed until the accepted solve.'));
    });
  }
  return {element,update,tick(){},dispose(){element.remove();}};
}
