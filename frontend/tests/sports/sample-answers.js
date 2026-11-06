// Transport/browser test data only. Fictional teams, future kickoff, no external provider requests.
export const RULES = { minStake: 1, maxStake: 50, dailyCap: 200, poolCutPercent: 5, pickLeadMinutes: 60 };
export const FIXTURE = {
  id: 'fd-123', sport: 'football', competition: 'Test league', home: 'Harbor Athletic', away: 'Island United',
  kickoff: '2099-11-06T20:00:00Z', closesAt: '2099-11-06T19:00:00Z', status: 'scheduled', source: 'live',
  homeScore: null, awayScore: null, picks: ['home', 'draw', 'away'], canStake: true,
  pool: { status: 'open', outcome: null, settlement: null, paidCoins: null, cutCoins: null, settledAt: null, total: 0, sides: {} },
};
export const BOARD = { fixtures: [FIXTURE], source: 'live', provider: 'football-data.org',
  fetchedAt: '2026-11-06T12:00:00Z', attribution: 'Football data provided by the Football-Data.org API',
  rules: RULES, simulationNote: 'Simulation. Play money only.' };
export const MINE = { coins: 1000, stakedToday: 0, coinsLeftToday: 200, stakes: [], checksUnavailable: false, rules: RULES, simulationNote: BOARD.simulationNote };
export const SAVED = { accepted: true, repeat: false, id: 'stake-1', fixtureId: FIXTURE.id, pick: 'home', amount: 10, coins: 990, simulationNote: BOARD.simulationNote };
export const OPEN_STAKE = { id: 'stake-1', fixtureId: FIXTURE.id, pick: 'home', amount: 10, payout: null,
  createdAt: BOARD.fetchedAt, home: FIXTURE.home, away: FIXTURE.away, sport: 'football', competition: FIXTURE.competition,
  kickoff: FIXTURE.kickoff, closesAt: FIXTURE.closesAt, status: 'open', outcome: null, settlement: null, settledAt: null };
