// Detach the deleted fake player while preserving the other crew and the public coast.
export function resetDeletedPlayer(state,createFresh,previousName){
  const otherCrews=[...(state.otherCrews??[])];
  if(state.crew)otherCrews.push({crew:state.crew,found:state.found,pins:state.pins,deductions:state.deductions,jobs:state.jobs,night:state.night});
  const publicState={worldRelit:state.worldRelit,wall:state.wall.filter(entry=>entry.name!==previousName),
    festivalUntil:state.festivalUntil,effectId:state.effectId,revision:state.revision,lobbyNow:state.lobbyNow};
  const presence=state.presence;presence.localEmote=null;
  Object.assign(state,createFresh(),publicState,{presence,otherCrews});
}
