// The fake's copy of backend/content/buildings.json. A test keeps the two equal, because the frontend build cannot read backend/.
export const fakeCatalogue = {
  about: 'The buildings of a home islet (package L2). Each spot is a hotspot of home_islet in frontend/src/world/places/registry.js and holds one kind of building. Every number is a start value from docs/story/OPEN-WORLD.md section 5.1 and changes only by pull request.',
  playMoneyNote: 'Play money. No cash value. It cannot be bought or cashed out.',
  starterTimber: 20,
  priceList: [
    {level: 1, coins: 300, timber: 10},
  ],
  spots: [
    {
      plot: 'plot_1', plotName: 'Cabin plot', type: 'cabin', name: 'Cabin',
      about: 'Your home on the islet. It stands from the start and costs nothing.',
      standsFromStart: true, buildable: false,
    },
    {
      plot: 'plot_2', plotName: 'Workshop plot', type: 'workshop', name: 'Workshop',
      about: 'A bench and tools for making parts. What it can make comes in a later update.',
      buildable: true,
    },
    {
      plot: 'plot_3', plotName: 'Windmill plot', type: 'windmill', name: 'Windmill',
      about: 'Presses lamp oil for your signal station.',
      buildable: false, lockedNote: 'Opens when timber starts washing up on your beach, in a later update.',
    },
    {
      plot: 'plot_4', plotName: 'Greenhouse plot', type: 'greenhouse', name: 'Greenhouse',
      about: 'A garden you can see from the sea.',
      buildable: false, lockedNote: 'Opens when timber starts washing up on your beach, in a later update.',
    },
    {
      plot: 'islet_signal_station', plotName: 'Islet signal station', type: 'signal_station', name: 'Signal station',
      about: 'Your home light. It shines over your islet at night.',
      buildable: true,
    },
  ],
};
