// Short display copy and bounded dialogue pages. Engine prose and action IDs stay unchanged.
const scenes={
  cottage:'Elena is missing. The lighthouse has been dark for three nights.\nSearch her desk, visit the shore or head to the lighthouse.',
  desk:'Three nights are circled in the tide tables. A logbook page is missing.\nAn open drawer catches your eye.',
  shore:'A lantern hangs by the boathouse. A fisherman waits beside a red boat.',
  tower_door:'The lighthouse door is locked. Find a way inside.',
  stairwell:'Broken stairs disappear into the dark. Bring a light before climbing.',
};
const actions={
  to_desk:'Search the desk',to_shore:'Visit the shore',to_tower:'Go to the lighthouse',
  take_key:'Take the key',read_log:'Read the logbook',desk_back:'Back to the cottage',
  take_lantern:'Take the lantern',trust_fisherman:'Tell the fisherman',warn_harbor:'Warn the harbor master',
  keep_quiet:'Tell no one',shore_back:'Back to the cottage',unlock_door:'Unlock the door',
  tower_back:'Back to the cottage',climb:'Climb the stairs',stair_back:'Go outside',
  signal:'Flash the alarm signal',untie:'Free Elena and hide',
};
export function introPages(text,limit=120) {
  const pages=[];
  for(const paragraph of String(text??'').split(/\n+/)) {
    let page='';
    for(const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if(page&&page.length+word.length+1>limit){pages.push(page);page='';}
      if(word.length>limit){if(page){pages.push(page);page='';}const letters=[...word];while(letters.length>limit)pages.push(letters.splice(0,limit).join(''));page=letters.join('');}
      else page=page?`${page} ${word}`:word;
    }
    if(page)pages.push(page);
  }
  return pages.length?pages:['Look around and choose your next move.'];
}
export const sceneCopy=view=>scenes[view.scene]??view.text;
export const choiceCopy=choice=>({...choice,label:actions[choice.id]??choice.label});
export function passageCopy(view,previous,notice) {
  const parts=[];
  if(notice)parts.push(notice);
  if(!previous||previous.scene!==view.scene)parts.push(sceneCopy(view));
  const before=new Set(previous?.notes??[]);
  parts.push(...view.notes.filter(note=>!before.has(note)));
  return introPages(parts.filter(Boolean).join('\n')||sceneCopy(view));
}
