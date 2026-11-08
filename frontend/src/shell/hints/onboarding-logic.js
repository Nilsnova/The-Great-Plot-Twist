// First-time help uses supplied account, crew and earned action facts; it grants no progress.
export const ONBOARDING_IDS=Object.freeze([
  'onboarding-sign-in','onboarding-kit','onboarding-crew','onboarding-station','onboarding-pin',
]);
const hint=(id,title,body,action,label)=>({id,title,body,action,label});
const connected=view=>view?.mode==='online'&&view.account
  &&!['loading','slow','offline','error','expired'].includes(view.account.connection?.state);
const crewSeat=seat=>Number.isInteger(seat)&&seat>=1&&seat<=4;

export function onboardingHints(view,{introComplete=false}={}) {
  if(!connected(view))return [];
  const account=view.account;
  if(account.state==='signed_out')return account.canSignIn===true
    ?[hint(ONBOARDING_IDS[0],'Keep your story','Sign in with GitHub for a cloud save and a crew. You can keep exploring solo.','account','Open account')]:[];
  if(account.state!=='signed_in')return [];
  if(account.hasKit===false){
    return introComplete===true&&view.arrival?.status==='pending'?[hint(ONBOARDING_IDS[1],'Confirm your kit',
      'Your story is complete. Open your arrival card to confirm your starting kit.','arrival','Open arrival')]:[];
  }
  if(account.hasKit!==true)return [];
  const crew=view.crew,permissions=view.permissions??{};
  if(crew?.status==='none'&&(permissions.createCrew===true||permissions.joinCrew===true))return [hint(ONBOARDING_IDS[2],'Find your crew',
    'Start a crew or join using a crew code. You can play solo with NPC partners.','crew','Open crew')];
  if(crew?.status==='forming'&&permissions.muster===true)return [hint(ONBOARDING_IDS[2],'Ready to set out?',
    'Muster your crew when everyone has joined. NPC partners can fill empty seats.','crew','Open crew')];
  if(crew?.status!=='active'||!crewSeat(crew.mySeat)||view.reveal?.available===true)return [];
  const result=[],station=view.finale?.islet,cards=Array.isArray(view.board?.cards)?view.board.cards:[];
  if(station?.id==='islet_signal_station'&&station.built===false&&station.canBuild===true)result.push(hint(ONBOARDING_IDS[3],'Prepare your light',
    'Build the signal station at Home islet. Get your crew ready for the night.','islet','Open your islet'));
  const hasPinned=cards.some(card=>Array.isArray(card?.pinnedBy)&&card.pinnedBy.some(pin=>pin?.seat===crew.mySeat));
  if(!hasPinned&&cards.some(card=>card?.canPin===true))result.push(hint(ONBOARDING_IDS[4],'Share your first clue',
    'Open the board and pin your clue so the crew can use it together.','board','Open board'));
  return result;
}
