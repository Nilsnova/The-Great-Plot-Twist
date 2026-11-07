// Presentation availability for A6 crews. The server still decides membership, seats and the muster.
export function crewPermissions(state={},account){
  const signedIn=(account?.state??state.accountState)==='signed_in';
  const hasKit=account?.hasKit??!!(state.me?.kit||state.profile?.kit);
  const crew=state.crew;
  if(!signedIn||!hasKit)return {createCrew:false,joinCrew:false,muster:false};
  const seats=Array.isArray(crew?.seats)?crew.seats:[];
  const mine=seats.find(seat=>seat.holder==='player'
    &&(seat.isMe===true||seat.seatNo===crew?.mySeat));
  const forming=crew?.status==='forming';
  const draft=forming&&crew.mySeat===1&&mine?.seatNo===1
    &&seats.filter(seat=>seat.holder==='player').length===1
    &&seats.every(seat=>seat.seatNo===1||seat.holder==='open');
  const available=!crew||crew.status==='finished';
  return {createCrew:available,joinCrew:available||draft,muster:forming&&!!mine};
}
