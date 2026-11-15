// Controlled Harbor/menu views for the B2 browser checks. No account, live request or real spend.
export const PHONE_SCENES = ['harbor','weather','weather-fallback','market','match','pause','settings','credits','shortcuts','help'];

export async function openPhoneFixture(name) {
  // Main entry sheets first, followed by world-only sheets; shared imports are already cached.
  for (const sheet of ['base','kit/kit','shell','styles','travel','readability','kit/components','devices','open-panels']) {
    await window.g20Import(`/src/ui/${sheet}.css`);
  }
  document.body.style.cssText = 'margin:0;background:#123a42';
  const focus = document.createElement('button'); focus.textContent = 'Game focus'; document.body.append(focus);
  const calls = {opened:[],focused:0};
  const shared = {container:document.body,resetInput:()=>{},focusGame:()=>{calls.focused++;focus.focus();}};
  const state = window.phoneFixture = {calls,focus};
  if (name === 'harbor') {
    const {createIslandUi} = await window.g20Import('/src/island/ui.js');
    const {harborModel} = await window.g20Import('/src/island/card-model.js');
    const {campaignOf} = await window.g20Import('/src/campaign/index.js');
    state.card = createIslandUi(shared);
    state.card.harborCard(harborModel({campaign:campaignOf({waveBest:10})}),{open:id=>calls.opened.push(id)});
  } else if (name.startsWith('weather')) {
    const {createWeatherCard} = await window.g20Import('/src/harbor/overview.js');
    const {weatherAnswer} = await window.g20Import('/tests/harbor/fixtures.js');
    state.card = createWeatherCard({...shared,getWeather:()=>weatherAnswer('storm',name === 'weather-fallback' ? {source:'fallback'} : {})}); state.card.open();
  } else if (name === 'market' || name === 'match') {
    const fx = await window.g20Import('/tests/harbor/fixtures.js');
    if (name === 'market') {
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      state.adapter = fx.fakeCalls();
      state.card = createMarketEntry({...shared,adapter:state.adapter,now:()=>fx.NOW});
    } else {
      const {createSportsPanel} = await window.g20Import('/src/harbor/match-card.js');
      // Team labels already present in the repository's recorded EPL data; fixture/time are made up.
      state.adapter = fx.fakeSports({board:fx.sportsBoard([fx.fixture({home:'Nottingham Forest FC',away:'Manchester City FC'})])});
      state.card = createSportsPanel({...shared,adapter:state.adapter,getToken:()=> 'test-session',clock:()=>fx.NOW,timeZone:'UTC'});
    }
    await state.card.open();
  } else if (name === 'shortcuts' || name === 'help') {
    if (name === 'shortcuts') {
      const {createShortcutsOverlay} = await window.g20Import('/src/shell/hints/shortcuts.js');
      state.card = createShortcutsOverlay();
    } else {
      const {createTutorialCard} = await window.g20Import('/src/tutorial/card.js');
      state.card = createTutorialCard();
    }
    state.card.open(document.body,focus);
  } else {
    await window.g20Import('/src/ui/shell.css');
    const {createShell} = await window.g20Import('/src/shell/controller.js');
    const {createSettingsView} = await window.g20Import('/src/settings/view.js');
    const {addMenuExtras} = await window.g20Import('/src/shell/menu-extras.js');
    addMenuExtras(()=>[{label:'Harbor',onSelect:()=>calls.opened.push('harbor')}]);
    state.card = createShell({...shared,focus:shared.focusGame,hasOverlay:()=>false,onState:()=>{},onPlay:()=>{},
      settingsView:()=>createSettingsView({})});
    state.card.play();
    if (name === 'settings') state.card.openSettings(); else state.card.show(name);
  }
}
