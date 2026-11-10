// Accessible controls for supplied presence data; world filters remain with the caller.
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {intentFailure} from '../../adapter/intent.js';
import {node,button} from '../helpers.js';
import './presence.css';

const emotes=['wave','cheer','point','lantern','shrug'];
const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value;};

export function createPresenceHud({send}={}){
  const element=node('aside','presence-hud');element.setAttribute('aria-label','Nearby captains presence');
  element.dataset.emotesOpen='false';
  const status=node('span','presence-sr-only');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const connection=node('p','presence-connection');
  const heading=node('div','presence-heading');
  const emoteToggle=button('Emotes',()=>setEmotesOpen(element.dataset.emotesOpen!=='true'));
  heading.append(connection,emoteToggle);
  const count=node('p','presence-count'),more=node('span','presence-more');
  const emoteRow=node('div','presence-emotes');emoteRow.hidden=true;
  let lastEmote=null,busy=false,disposed=false;
  const call=createServerCallState({label:'emote',onRetry:()=>lastEmote&&invokeEmote(lastEmote),onSignIn:()=>send?.('signIn')});
  async function invokeEmote(id){if(busy||disposed||model.status!=='live'||!model.canEmote)return;lastEmote=id;busy=true;call.loading();try{const result=await send?.('setEmote',id);if(!disposed){if(result?.accepted)call.succeed();else call.fail(result??intentFailure());}}catch(error){if(!disposed)call.fail(intentFailure(error));}finally{busy=false;}}
  const emoteButtons=emotes.map(id=>button(`Emote ${id}`,()=>{void invokeEmote(id);setEmotesOpen(false);},{focus:`presence-${id}`}));
  emoteRow.append(...emoteButtons);element.append(heading,status,count,more,emoteRow,call.element);
  let model={status:'off',others:[],hiddenCount:0,canEmote:false,cooldown:0};
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
    const connectionMessage=model.status==='off'?'Off':model.status==='offline'?'Offline':model.status==='reconnecting'?'Reconnecting':`Live · ${nearby}`;
    const accessibleMessage=model.status==='off'?'Presence is off.':model.status==='offline'?'Presence is offline.':model.status==='reconnecting'?'Reconnecting to captains nearby.':
      `${nearby} captains nearby; ${counts.drawn} shown${names.length?`: ${names.join(', ')}`:''}${counts.hidden?`, ${counts.hidden} more here`:''}.`;
    setText(connection,connectionMessage);setText(status,accessibleMessage);
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
  },dispose(){disposed=true;call.dispose();element.remove();}};
}
