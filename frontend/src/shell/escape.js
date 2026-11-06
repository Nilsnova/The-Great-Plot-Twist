// One Escape order, shared by the shell and pure keyboard tests.
export function escapePriority({panel=false,cinematic=false,playing=false}={}){
  if(panel)return 'close_panel';
  if(cinematic)return 'skip_cinematic';
  return playing?'pause':'none';
}
