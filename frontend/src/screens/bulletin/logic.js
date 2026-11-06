// Formatting helpers use only server timestamps plus a local clock for countdown display.
export function lisbonDateTime(value){
  if(!value)return 'Time unavailable';
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Time unavailable';
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(date)+' Lisbon time';
}
export function durationUntil(instant,nowMs=Date.now()){
  const target=new Date(instant).getTime();if(!Number.isFinite(target))return 'Time unavailable';
  const seconds=Math.max(0,Math.ceil((target-nowMs)/1000));
  if(seconds<60)return `in ${seconds} sec`;
  const minutes=Math.ceil(seconds/60);if(minutes<60)return `in ${minutes} min`;
  const hours=Math.floor(minutes/60),remaining=minutes%60;return `in ${hours} hr${remaining?` ${remaining} min`:''}`;
}
export function tonightLabel(tonight,nowMs=Date.now()){
  if(!tonight)return null;
  const state=tonight.state??'Weather unavailable';
  const fog=tonight.isFogNight?`Fog night${tonight.fogNightKind==='almanac'?" · by the harbor's almanac":''}`:null;
  return {state,fog,startsAt:tonight.isNow?'Tonight':`Starts ${lisbonDateTime(tonight.startsAt)} (${durationUntil(tonight.startsAt,nowMs)})`};
}
