// A journal-paid tower restore passes through the same replay adapter as recovery-v1 clients.
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { simulationInputFromJournal } from '../../src/pirates/recovery-transport.js';
import { createReplayDriver, createWaveReplay } from '../../src/pirates/wave-replay.js';
import { towerEdgeDistance } from '../../src/pirates/tower-obstacles.js';

describe('paid tower restore in recovery replay', () => {
  it('reactivates a tower under an occupying boarder and preserves subsequent damage', () => {
    const tower = { id: 'cannon_1', spot: 'cannon_1', instanceId: 'cannon-instance', kind: 'cannon', level: 1,
      x: 0, z: 3.5, hpUnits: 0, maxHP: 80, repairSeq: 0 };
    const wave = createWave({ seed: 5, wave: 3, island: { hp: 5000 }, defenses: [tower], recoveryStructures: [tower],
      towerHealth: true, pathing: true, towerObstacles: true, recoveryVersion: 1, waveProtocol: 2 });
    expect(wave.state().towers.find(item => item.id === tower.id)).toMatchObject({ hp: 0, broken: true });

    const event = { serverSeq: 1, effectiveTick: 0, type: 'structure_repaired', participantToken: null,
      payload: { spot: tower.spot, instanceId: tower.instanceId, hpUnits: 1_000_000, maxHP: tower.maxHP, repairSeq: 1 } };
    const replay = createWaveReplay();
    expect(replay.addPage({ headSeq: 0, sealedThroughTick: 0, events: [] })).toBe(true);
    const driver = createReplayDriver(replay);
    const advance = tick => {
      if (tick > replay.sealedThroughTick) {
        expect(replay.addPage({ headSeq: replay.headSeq, sealedThroughTick: tick, events: [] })).toBe(true);
      }
      let events = [];
      expect(driver.advanceThrough(tick, (simTick, journal) => {
        expect(simTick).toBe(tick);
        events = wave.step(.05, journal.map(simulationInputFromJournal).filter(Boolean));
      })).toBe(true);
      return events;
    };
    advance(0);
    let restoreTick = null, occupyingId = null;
    for (let tick = 1; tick < 6_000 && !wave.done; tick++) {
      advance(tick);
      const state = wave.state();
      const inside = state.boarders.find(boarder => Math.abs(boarder.x - tower.x) <= .25
        && Math.abs(boarder.z - tower.z) <= .25);
      if (!inside) continue;
      occupyingId = inside.id;
      restoreTick = tick + 1;
      event.effectiveTick = restoreTick;
      expect(replay.addPage({ headSeq: 1, sealedThroughTick: 6_000, events: [event] })).toBe(true);
      advance(restoreTick);
      expect(wave.state().towers.find(item => item.id === tower.id)).toMatchObject({ hp: 80, broken: false });
      break;
    }
    expect(restoreTick).not.toBeNull();
    expect(occupyingId).not.toBeNull();
    let fired = false, damagedAfterRestore = false, hpFell = false, previousHp = 80;
    for (let tick = restoreTick + 1; tick < 6_000 && !wave.done; tick++) {
      const events = advance(tick);
      fired ||= events.some(item => item.type === 'cannon_fired' && item.cannonId === tower.id);
      damagedAfterRestore ||= events.some(item => item.type === 'tower_damaged' && item.towerId === tower.id);
      const state = wave.state(), activeTower = state.towers.find(item => item.id === tower.id);
      expect(activeTower.hp).toBeLessThanOrEqual(previousHp);
      hpFell ||= activeTower.hp < 80;
      previousHp = activeTower.hp;
    }
    expect(fired).toBe(true);
    expect(damagedAfterRestore).toBe(true);
    expect(hpFell).toBe(true);
  });
});
