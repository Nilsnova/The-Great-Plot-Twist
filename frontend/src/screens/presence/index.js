// Accessible controls for supplied presence data; world filters remain with the caller.
import {node,button} from '../helpers.js';
import './presence.css';

const emotes=['wave','cheer','point','lantern','shrug'];
const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value;};

export function createPresenceHud({send,onCrew=()=>{}}={}){
  const element=node('aside','presence-hud');element.setAttribute('aria-label','Nearby captains presence');
  element.dataset.emotesOpen='false';
  const status=node('span','presence-sr-only');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const connection=node('p','presence-connection');
  const heading=node('div','presence-heading');const crewButton=button('Crew',()=>onCrew());
  const emoteToggle=button('Emotes',()=>setEmotesOpen(element.dataset.emotesOpen!=='true'));
  heading.append(connection,crewButton,emoteToggle);
  const count=node('p','presence-count'),more=node('span','presence-more');
  const crewStrip=node('div','presence-crew-strip');crewStrip.setAttribute('aria-label','Crew seats');
  const seats=[1,2,3,4].map(()=>node('span','presence-seat'));crewStrip.append(...seats);
  const emoteRow=node('div','presence-emotes');emoteRow.hidden=true;
  const emoteButtons=emotes.map(id=>button(`Emote ${id}`,()=>{send?.('setEmote',id);setEmotesOpen(false);},{focus:`presence-${id}`}));
  emoteRow.append(...emoteButtons);element.append(heading,status,count,more,crewStrip,emoteRow);
  let model={status:'off',others:[],crew:[],hiddenCount:0,canEmote:false,cooldown:0};
  let counts={drawn:0,hidden:0,ids:[]};

  function setEmotesOpen(open){
    element.dataset.emotesOpen=String(open);emoteRow.hidden=!open;
    emoteToggle.setAttribute('aria-expanded',String(open));
  }
  function updateSummary(){
    const nearby=counts.drawn+counts.hidden;
    setText(count,`${counts.drawn} shown · ${counts.hidden} hidden`);
    setText(more,counts.hidden?`+${counts.hidden} more captain${counts.hidden===1?'':'s'} here`:'');more.hidden=!counts.hidden;
    const people=new Map((model.others??[]).map(person=>[person.id,`${person.name} (${person.kit?.name??'Captain'})`]));
    const names=counts.ids.map(id=>people.get(id)).filter(Boolean);
    const connectionMessage=model.status==='off'?'Presence off':model.status==='offline'?'Presence offline':model.status==='reconnecting'?'Reconnecting':`${nearby} nearby · ${counts.drawn} shown`;
    const accessibleMessage=model.status==='off'?'Presence is off.':model.status==='offline'?'Presence is offline.':model.status==='reconnecting'?'Reconnecting to captains nearby.':
      `${nearby} captains nearby; ${counts.drawn} shown${names.length?`: ${names.join(', ')}`:''}${counts.hidden?`, ${counts.hidden} more here`:''}.`;
    setText(connection,connectionMessage);setText(status,accessibleMessage);
    const crew= new Map((model.crew??[]).map(member=>[member.seat,member]));
    setText(crewButton,`Crew (${model.crew?.length??0})`);
    seats.forEach((badge,index)=>{
      const seat=index+1,member=crew.get(seat);
      setText(badge,member?`${seat} ${member.online?'On':'Away'}${member.isPartner?' ★':''}`:`${seat} Open`);
      badge.dataset.online=member?.online?'online':'away';badge.dataset.partner=member?.isPartner?'true':'false';
      const label=member?`Seat ${seat}: ${member.name}, ${member.online?'online':'away'}${member.isPartner?', partner':''}`:`Seat ${seat}: open`;
      if(badge.dataset.summary!==label){badge.setAttribute('aria-label',label);badge.dataset.summary=label;}
    });
    for(const control of emoteButtons){
      const disabled=model.status!=='live'||!model.canEmote;
      if(control.disabled!==disabled)control.disabled=disabled;
      const title=!model.canEmote&&model.cooldown>0?`Available in ${Math.ceil(model.cooldown/1000)} seconds`:'';
      if(title&&control.title!==title)control.title=title;
      else if(!title&&control.title)control.removeAttribute?.('title');
    }
  }
  function update(view){
    model=view?.presence??view??model;
    const available=new Set((model.others??[]).map(peer=>peer.id));
    counts={drawn:model.others?.filter(peer=>peer.place===model.place).length??0,hidden:model.hiddenCount??0,ids:counts.ids.filter(id=>available.has(id))};
    updateSummary();
  }
  return {element,update,setCounts(value={}){
    const ids=Array.isArray(value.ids)?value.ids:counts.ids;
    counts={drawn:Math.max(0,value.drawn??0),hidden:Math.max(0,value.hidden??0),ids};updateSummary();
  },dispose(){element.remove();}};
}
