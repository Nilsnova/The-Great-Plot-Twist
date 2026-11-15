// Browser-only B3 components with controlled failures. Used by check-feedback.mjs, never the game.
export async function showFeedbackFixture(name) {
  await import('/src/ui/kit/kit.css');
  await import('/src/ui/readability.css');
  document.body.style.cssText = 'margin:0;background:#123a42;color:#fbf2dc;font:18px system-ui';
  const calls = window.feedback = {join:0, create:0, build:0, retry:0, intents:[]};
  if (name.startsWith('join') || name === 'create-offline') {
    const {chooseGame} = await import('/src/front-door/games.js');
    const {createFakeIslandTransport} = await import('/src/pirates/fake-api.js');
    const {createIslandApi} = await import('/src/island/api.js');
    const api = createIslandApi({transport:createFakeIslandTransport()}), create = api.createGame;
    api.joinGame = async () => {
      calls.join++;
      return {ok:false,status:409,code:'game_full',message:'This game has 10 players already.'};
    };
    api.createGame = async () => {
      if (++calls.create === 1) throw Error('controlled offline fixture');
      return create();
    };
    const card = chooseGame({container:document.body,lane:{api,mode:'fake'}});
    card.done.then(choice => { calls.choice = choice; });
    return;
  }
  if (name === 'connection-offline') {
    const {createConnectionBanner} = await import('/src/ui/connection-banner.js');
    const banner = createConnectionBanner({send:async intent => { calls.intents.push(intent); }});
    document.body.append(banner.element);
    banner.update({account:{connection:{state:'offline',message:'No connection. Check your internet and try again.'}}});
    return;
  }
  const {createIslandUi} = await import('/src/island/ui.js');
  const ui = createIslandUi({container:document.body});
  if (name === 'leaderboard-offline') {
    ui.leaderboardCard({message:'Weekly results need an online game. Return to the title and sign in to play online.'}, () => { calls.retry++; });
    return;
  }
  const {buildCardModel} = await import('/src/island/card-model.js');
  const {unlocksFor} = await import('/src/island/td-rules.js');
  ui.buildCard(buildCardModel({spotId:'cannon_1',slot:'tower',
    spot:{id:'cannon_1',kind:'cannon',built:false,level:0,cost:30},
    coins:name === 'build-coins' ? 0 : 100, unlocks:unlocksFor(0),
    busy:name === 'build-busy' ? 'cannon' : false}), {build:() => { calls.build++; }});
}
