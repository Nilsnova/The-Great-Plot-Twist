// Mutable memory owned only by the fake. Never saved, fetched or treated as server authority.
export function initialCaseState() {
  return {revision:0,now:0,captainName:'Captain Lantern',profile:null,coins:0,timber:20,crew:null,joinPreview:null,joinAttempts:0,joinWaitUntil:0,
    found:{1:[],2:[],3:[],4:[]},creditedCards:[],pins:[],deductions:[],jobs:[],pairWaitUntil:0,night:null,stations:false,ruinReady:false,
    schooner:false,aboard:false,accuseWaitUntil:0,solved:false,revealIndex:0,worldRelit:false,festivalUntil:0,wall:[],lanternColour:null,effects:[],effectId:0,activeSpot:'satchel',allowBrowse:false,beachCrate:false,jobId:0,duties:[],lastReport:null};
}
export const accept=message=>({accepted:true,reason:null,message});
export const refuse=(reason,message)=>({accepted:false,reason,message});
export function playerSeat(state){return state.crew?.seats.find(seat=>seat.kind==='player'&&seat.isYou)?.seat??1;}
export function effect(state,name,params={}) {state.effects.push({id:++state.effectId,type:'cinematic',name,params});}
