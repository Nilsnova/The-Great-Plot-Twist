// Crew DTOs become screen seats; account, crew and partner identifiers remain private.
import {kitDisplay,kitArchetype} from '../../adapter/shared/kits.js';

function seatView(seat,number){
  const kind=seat?.holder==='player'?'player':seat?.holder==='partner'?'npc':'open';
  const kit=kind==='open'?null:kitDisplay(seat?.kit);
  return {seat:number,kind,name:typeof seat?.name==='string'?seat.name:'Open seat',kit,
    isYou:kind==='player'&&seat?.isMe===true,archetype:kitArchetype(kit),cards:[]};
}

function previewView(preview){
  if(!preview||typeof preview.code!=='string')return null;
  return {code:preview.code,seat:null,replaces:null,
    message:typeof preview.message==='string'?preview.message:'Confirm joining this crew.'};
}

export function mapCrew(state={}){
  const crew=state.crew;
  const seats=Array.isArray(crew?.seats)?crew.seats:[];
  const status=['forming','active','finished'].includes(crew?.status)?crew.status:'none';
  return {status,code:typeof crew?.code==='string'?crew.code:null,
    mode:crew?.mode==='solo'?'solo':crew?.mode==='crew'?'crew':null,
    mySeat:Number.isInteger(crew?.mySeat)?crew.mySeat:null,startedAt:crew?.startedAt??null,
    seats:Array.from({length:4},(_,index)=>seatView(seats.find(seat=>seat.seatNo===index+1),index+1)),
    joinPreview:previewView(state.joinPreview)};
}
