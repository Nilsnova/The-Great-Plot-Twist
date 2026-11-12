// Every word of "How to play" lives here (docs/TOWER-DEFENSE.md §13): Menu › How to play shows all
// pages, and a player's first Play shows the first FIRST_RUN_PAGES once, after the voiced intro.
// One idea per page, 1 to 3 short sentences. Art reuses sprites from public/pixel/ (w and h are the
// PNG's own size; scale is a whole number, so the pixels stay square). Edit the text here only.
export const TUTORIAL_KEY = 'plot_twist_tutorial_v1';
export const FIRST_RUN_PAGES = 4;
export const TUTORIAL_TITLE = 'How to play';

const art = (file, w, h, scale) => Object.freeze({file, w, h, scale});

const freezePage = page => Object.freeze({...page, text: Object.freeze(page.text), art: Object.freeze(page.art),
  ...(page.keys ? {keys: Object.freeze(page.keys.map(pair => Object.freeze(pair)))} : {})});

export const TUTORIAL_PAGES = Object.freeze([
  {id: 'island', title: 'Your island and coins',
    text: ['Every game is one island: defend it alone or with friends.', 'You start with 🪙 200 coins.', 'Win waves to earn more.'],
    alt: 'A small house and a coin',
    art: [art('island-house.png', 64, 64, 2), art('coin-icon.png', 16, 16, 4)]},
  {id: 'build', title: 'Build',
    text: ['The island has 16 build spots for walls, cannons and mortars, and 6 more for inner walls after wave 5.',
      'Tap a spot, or walk up to it and press E; build on it again to raise its level.',
      'A house adds loot, and from level 2 it picks a job: Barracks, Tavern or Workshop.'],
    alt: 'A wall, a cannon and a mortar',
    art: [art('island-wall.png', 48, 48, 2), art('island-cannon.png', 48, 32, 2), art('island-mortar.png', 48, 32, 2)]},
  {id: 'bell', title: 'Ring the bell',
    text: ['Ring the bell to call a wave of pirate ships.', 'Every 5th wave brings a boss.',
      'After a win you get a short break: press Next wave when you are ready.'],
    alt: 'A pirate sloop and a big warship',
    art: [art('pirate-sloop-1.png', 64, 64, 2), art('pirate-warship-1.png', 160, 128, 1)]},
  {id: 'captain', title: 'Your captain fights',
    text: ['Click a spot to aim your musket and fire there.', 'Press F to fire at the nearest ship, and hold F to keep firing.',
      'On a phone, tap where to fire, or use the musket button at the bottom right.'],
    alt: 'Your captain fires a musket at a pirate sloop',
    art: [art('captain-musket-2.png', 48, 32, 3), art('pirate-sloop-1.png', 64, 64, 2)]},
  {id: 'ashore', title: 'Pirates come ashore',
    text: ['Pirates that reach the shore climb out and attack on foot: the heart of the island and any captain nearby.',
      'Walls stop them: press E at a damaged wall to repair it, at a broken one to rebuild it.', 'Your gun beats them, and up close F swings your cutlass.'],
    alt: 'A pirate sloop, a cracked wall and your captain with a musket',
    art: [art('pirate-sloop-1.png', 64, 64, 1), art('island-wall-damaged.png', 48, 48, 2), art('captain-musket-1.png', 48, 32, 2)]},
  {id: 'health', title: 'Falling and helping up',
    text: ['Boarders hit captains too: after too many hits you fall.',
      'A teammate next to you holds E for 2 seconds to help you up, and pays a few coins.',
      'If nobody does, you stand up at the break; if every captain falls, the wave is lost.'],
    alt: 'A boarder and a captain',
    art: [art('pirate-boarder-1.png', 16, 32, 3), art('explorer.png', 24, 32, 3)]},
  {id: 'crew', title: 'Crew and captain skills',
    text: ['Hire a gunner, a carpenter or a lookout in Menu › Crew.',
      'Win new waves to earn skill points.', 'Spend them in Menu › Captain and skills on Marksman, Brawler or Shipwright.'],
    alt: 'A gunner, a carpenter and a lookout',
    art: [art('crew-gunner.png', 16, 32, 3), art('crew-carpenter.png', 16, 32, 3), art('crew-lookout.png', 16, 32, 3)]},
  {id: 'unlocks', title: 'More as you win',
    text: ['You start with walls, cannons and your musket.',
      'Each new wave you win can unlock more: houses, mortars, a watchtower, crew and level 3.',
      'After wave 8 the Tech hub opens: research skills there for every tower of a kind.'],
    alt: 'A big mortar and a pirate flag won in battle',
    art: [art('island-mortar-l3.png', 48, 32, 2), art('pirate-flag-trophy.png', 32, 48, 2)]},
  {id: 'friend', title: 'Play with friends',
    text: ['Play › Create a game, then send its link or code to friends, who choose Join a game.',
      'Up to 10 captains defend one island together, and everyone earns their own loot.',
      'Between waves anyone can tear a building down: everyone who paid for it gets back half of what they paid.'],
    alt: 'A captain waves hello',
    art: [art('explorer.png', 24, 32, 3), art('emote-wave.png', 24, 24, 2)]},
  {id: 'places', title: 'The Harbor and Pirate Point',
    text: ['At the Harbor you make market calls, decided after 5 minutes, and pick teams on the football board.',
      'Pirate Point is one island for everyone: light the three lamps together to sink the flagship.'],
    alt: 'The market hall and a lit lamp',
    art: [art('market-hall.png', 144, 128, 1), art('festival-lamp-01-lit.png', 48, 80, 1)]},
  {id: 'controls', title: 'Controls',
    text: ['On a phone, use the joystick and the buttons on screen.'],
    keys: [['WASD or arrows', 'Walk'], ['E', 'Build, use, repair, help up'], ['F', 'Fire your musket'], ['Click', 'Aim and fire'],
      ['M', 'Sea chart'], ['Mouse wheel', 'Zoom']],
    alt: 'A brass compass',
    art: [art('compass.png', 32, 32, 3)]},
].map(freezePage));

// One island only (docs/GAME-V3.md §2, the flag one_island, on by default): no sea chart and no Pirate
// Point; the Harbor is a building on the island that opens after wave 4.
const ONE_ISLAND = Object.freeze({
  places: freezePage({id: 'places', title: 'The Harbor',
    text: ['After wave 4 the Harbor opens as a building on your island.',
      'Make market calls there, decided after 5 minutes. Its football board opens later.'],
    alt: 'The market hall',
    art: [art('market-hall.png', 144, 128, 1)]}),
});
export const ONE_ISLAND_PAGES = Object.freeze(TUTORIAL_PAGES.map(page => {
  if (ONE_ISLAND[page.id]) return ONE_ISLAND[page.id];
  if (page.id === 'controls') return freezePage({...page, keys: page.keys.filter(([key]) => key !== 'M')});
  return page;
}));
// The pages for this game: the one-island pages while the flag is on (src/island/one-island.js).
export const tutorialPages = (one = true) => (one ? ONE_ISLAND_PAGES : TUTORIAL_PAGES);

// The pages a first Play shows: island, build, bell and captain.
export const firstRunPages = (pages = TUTORIAL_PAGES) => pages.slice(0, FIRST_RUN_PAGES);

// A page number that always exists (0 for an empty or broken value).
export function clampPage(index, count) {
  if (!Number.isSafeInteger(count) || count < 1) return 0;
  return Number.isSafeInteger(index) ? Math.min(Math.max(index, 0), count - 1) : 0;
}

// What the card shows for one page and mode ('first' after the intro, 'menu' from the Menu).
export function pageView(pages, index, mode = 'menu') {
  const count = pages.length, at = clampPage(index, count), last = at === count - 1;
  return {index: at, count, page: pages[at], first: at === 0, last,
    status: `Page ${at + 1} of ${count}`,
    next: last ? (mode === 'first' ? 'Start playing' : 'Done') : 'Next',
    leave: mode === 'first' ? 'Skip' : 'Close'};
}

// Whether a first Play shows the pages: once per device, never for a class-code player (the class
// demo has its own goals and must start within seconds).
export function wantsFirstRun({seen = false, classHarbor = false} = {}) {
  return !seen && !classHarbor;
}
