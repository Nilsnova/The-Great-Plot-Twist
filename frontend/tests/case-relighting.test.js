import {it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {claimLantern,worldView} from '../src/adapter/fake/relighting.js';
it('only supplies a free colour during the 48-hour festival and keeps relighting after it ends',()=>{const s=initialCaseState();expect(claimLantern(s,'gold').reason).toBe('festival_closed');s.worldRelit=true;s.festivalUntil=172800;s.coins=700;expect(worldView(s).gullsRestOpen).toBe(true);expect(claimLantern(s,'sea').accepted).toBe(true);expect(s.coins).toBe(700);s.worldNow=172800;expect(claimLantern(s,'rose').accepted).toBe(false);expect(worldView(s).lightsOn).toBe(true);expect(worldView(s).festivalRemaining).toBe(0);});
