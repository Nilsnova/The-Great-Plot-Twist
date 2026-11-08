// Small next-step cards for the live view. Only supplied capabilities choose navigation;
// no clue combination, suspect, timer completion or game outcome is decided here.
const empty = () => ({items:[],actions:[]});
const unavailable = new Set(['offline','error','expired','rate_limited']);

function steps() {
  const result = empty(), destinations = new Set();
  return {result, add(id, title, body, screen, params = {}) {
    const destination = `${screen}:${JSON.stringify(params)}`;
    if(result.actions.length >= 3 || destinations.has(destination))return;
    destinations.add(destination);
    const number = result.actions.length + 1, key = `next-${id}`;
    result.items.push({id:key,title:`${number}. ${title}`,body});
    result.actions.push({id:key,label:title,screen,params:{...params},available:true,priority:number*10});
  }};
}

function crewStep(view, guide) {
  if(view.crew?.status === 'none' && (view.permissions?.createCrew === true || view.permissions?.joinCrew === true)) {
    guide.add('find-crew','Find your crew','Start a crew or join a friend. You can also set out solo.','crew');
    return true;
  }
  if(view.crew?.status === 'forming' && view.permissions?.muster === true) {
    guide.add('muster-crew','Set out when ready','Invite friends with your crew code, then muster. Open seats can travel with partners.','crew');
    return true;
  }
  return false;
}

function finaleStep(view, guide) {
  const finale = view.finale;
  if(finale?.phase === 'night') {
    if(finale.lights.some(light => light.canAim === true))
      guide.add('aim-light','Aim your light','Use the compass to aim at the glow, then lock your beam.','finale');
    else if(finale.lights.some(light => light.canTake === true))
      guide.add('take-post','Take an open post','Choose an available light post on the Lights screen.','finale');
    else guide.add('night-status','Check the lights',finale.status,'finale');
    return true;
  }
  if(finale?.phase === 'dawn') {
    guide.add('night-status','Check the lights',finale.status,'finale');
    return true;
  }
  if(finale?.canCall === true)
    guide.add('call-night','Gather at the lights','Nightfall is available. Start when your crew is ready.','finale');
  else if(finale?.islet?.built === false && finale.islet.canBuild === true)
    guide.add('build-station','Prepare your light','Your signal station is ready to build. Check its cost on the Lights screen.','finale');
  return false;
}

// The extra port is the earned spots array already validated by case-shapes.js. Only a
// hotspot also present in the public search list may become a navigation parameter.
function searchSpots(view, supplied) {
  const visible = new Set((view.search?.spots ?? []).map(spot => spot.id));
  const spots = (Array.isArray(supplied) ? supplied : []).filter(spot => visible.has(spot.hotspot));
  const selected = spots.find(spot => spot.hotspot === view.search?.activeSpot);
  return selected ? [selected,...spots.filter(spot => spot !== selected)] : spots;
}

function searchStep(view, spots, guide) {
  const ready = spots.find(spot => spot.routes?.some(route => route.canStart === true));
  if(ready)guide.add('search-route','Follow a lead',
    'A search is available. Check its time and any coin cost before starting.','search',{spot:ready.hotspot});
  if(view.board?.canPair === true && view.board.cards.filter(card => card.canPair === true).length >= 2)
    guide.add('compare-cards','Compare your clues','Choose two cards on the Captain’s Table and compare the evidence.','board');
  if(view.partners?.some(partner => partner.canOrder === true
    && partner.orders.some(order => (partner.targets?.[order.id]?.length ?? 0) > 0)))
    guide.add('order-partner','Ask a partner','A partner has an available order. Choose a task on the Partners screen.','partners');
}

function waitingStep(view, spots, guide) {
  if(guide.result.actions.length)return;
  const job = view.search?.jobs?.find(job => job.done === false);
  if(job) {
    const spot = spots.find(spot => spot.routes?.some(route => route.id === job.routeId));
    guide.add('search-progress','Check your search','Your search is underway. Its result will appear when it is ready.',
      'search',spot ? {spot:spot.hotspot} : {});
    return;
  }
  const spot = spots.find(spot => spot.routes?.some(route => route.statusText) || spot.closedLine);
  if(spot)guide.add('search-details','Check a lead',
    spot.routes?.find(route => route.statusText)?.statusText || spot.closedLine,'search',{spot:spot.hotspot});
  else if(view.finale?.islet?.built === false && view.finale.islet.caption)
    guide.add('station-details','Check your light',view.finale.islet.caption,'finale');
}

export function projectCaseGuidance(view, {spots:suppliedSpots = []} = {}) {
  const guide = steps();
  if(view?.mode !== 'online' || view.account?.state !== 'signed_in'
    || unavailable.has(view.account.connection?.state))return guide.result;
  if(crewStep(view,guide))return guide.result;
  if(view.crew?.caseReady !== true)return guide.result;
  if(view.reveal?.available === true) {
    const done = view.reveal.done === true;
    guide.add(done?'visit-coast':'read-reveal',done?(view.world?.lightsOn===true?'See the relit coast':'See the coast'):'Read the reveal',
      done?'Your recorded reveal is complete. Visit the coast.':'Read the finding your crew has earned, one passage at a time.',
      done?'relighting':'reveal');
    return guide.result;
  }
  if(view.accusation?.schoonerFound === true) {
    guide.add('review-evidence','Review the evidence',view.accusation.allowed === true
      ?'Your crew can present an accusation. Review the recorded evidence before choosing a suspect.'
      :view.accusation.status,'accusation');
    if(view.accusation.allowed === true)return guide.result;
  }
  if(finaleStep(view,guide))return guide.result;
  if(view.board?.cards?.some(card => card.canPin === true))
    guide.add('pin-card','Share a clue','Open the Captain’s Table and pin a card you have found.','board');
  const spots = searchSpots(view,suppliedSpots);
  searchStep(view,spots,guide);
  waitingStep(view,spots,guide);
  return guide.result;
}
