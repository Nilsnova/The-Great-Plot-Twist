// Validate transport envelopes before publishing them; duel outcomes remain server fields.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const coins=value=>Number.isInteger(value)&&value>=0;
const summaries=value=>Array.isArray(value)&&value.every(item=>object(item)&&id(item.id));
const choices=(value,minimum)=>value===undefined||(Array.isArray(value)&&value.length>0
  &&value.every(item=>Number.isInteger(item)&&item>=minimum));
export function validDuelList(value){
  return object(value)&&coins(value.coins)&&coins(value.heldCoins)
    &&['incoming','openChallenges','yours','recent'].every(key=>summaries(value[key]))
    &&typeof value.serverTime==='string'&&Number.isFinite(Date.parse(value.serverTime))
    &&(value.rules===undefined||(object(value.rules)&&choices(value.rules.roundChoices,1)&&choices(value.rules.stakeChoices,0)));
}
export function validDuelDetail(value){
  const duel=value?.duel;
  return object(duel)&&id(duel.id)
    &&(duel.yourSignals==null||(Array.isArray(duel.yourSignals)&&duel.yourSignals.every(signal=>['flash','shade','mirror'].includes(signal))))
    &&(duel.reveal==null||(Array.isArray(duel.reveal)&&duel.reveal.every(object)));
}
