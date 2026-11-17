// Small deterministic runtime comparison for T57. Run with:
//   cd frontend && npx vitest run --maxWorkers=1 tests/pirates/recovery-balance-diagnostic.test.js
// This exercises the pure combat sim only; it does not emulate SQL pricing, multiplayer,
// HTTP ordering, paid-repair authorization, or human play.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { it } from 'vitest';

const DT = CONFIG.tick;
const PAID_TICKS = [0, 100, 200];
const CASES = [
  { stage: 'early', wave: 2, seed: 20261117 },
  { stage: 'mid', wave: 15, seed: 20261130 },
  { stage: 'late', wave: 35, seed: 20261217 },
];
const CREWS = [
  { label: 'solo proxy', crew: { gunner: 0, carpenter: 1 } },
  { label: 'co-op proxy', crew: { gunner: 1, carpenter: 2 } },
];

const build = [
  { id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 11, health: 60 },
  { id: 'wall_2', kind: 'wall', level: 2, x: 8, z: 8, health: 60 },
  { id: 'wall_3', kind: 'wall', level: 2, x: -8, z: 8, health: 60 },
  { id: 'wall_4', kind: 'wall', level: 2, x: 0, z: -12, health: 60 },
  { id: 'cannon_1', kind: 'cannon', level: 2, x: -8, z: -3 },
  { id: 'cannon_2', kind: 'cannon', level: 2, x: 8, z: -3 },
  { id: 'house_1', kind: 'house', level: 2, spec: 'workshop', x: 0, z: 9 },
];
const maxHp = defense => defense.kind === 'wall'
  ? CONFIG.levels.wall[defense.level - 1].hp
  : CONFIG.levels[defense.kind][defense.level - 1].hp;

function simulate({ wave, seed, crew, policy, paidCount }) {
  const structures = build.filter(item => item.kind === 'wall' || item.kind === 'cannon')
    .map((item, index) => ({ ...item, spot: item.id, instanceId: `case-${wave}-${item.id}`,
      maxHP: maxHp(item), hpUnits: item.kind === 'wall' ? 600_000 : 1_000_000, repairSeq: 0,
      ...(item.kind === 'wall' ? {} : { health: undefined }), ordinal: index }));
  const bySpot = new Map(structures.map(item => [item.spot, item]));
  const v1 = policy === 'recovery-v1';
  const defenses = build.map(item => {
    const structure = bySpot.get(item.id);
    if (!v1 || !structure) return { ...item };
    const { health, ...clean } = item;
    return { ...clean, spot: structure.spot, instanceId: structure.instanceId,
      maxHP: structure.maxHP, hpUnits: structure.hpUnits, repairSeq: structure.repairSeq };
  });
  const sim = createWave({ seed, wave, weather: { ships: 1, fog: 0 }, defenses, crew,
    towerHealth: true, pathing: true, towerObstacles: true,
    ...(v1 ? { recoveryVersion: 1, waveProtocol: 2, recoveryStructures: structures } : {}) });
  const paidTargets = ['wall_1', 'wall_2', 'wall_3'].slice(0, paidCount);
  const events = PAID_TICKS.slice(0, paidCount).map((effectiveTick, index) => {
    const item = bySpot.get(paidTargets[index]);
    return { serverSeq: index + 1, effectiveTick, type: 'structure_repaired', payload: {
      spot: item.spot, instanceId: item.instanceId, hpUnits: 1_000_000, maxHP: item.maxHP,
      repairSeq: 1, chargedPrice: 0,
    } };
  });
  let tick = 0, paidApplied = 0;
  const hp = () => {
    const state = sim.state();
    return Object.fromEntries([...state.walls, ...state.towers].map(item => [item.id, item.hp]));
  };
  while (!sim.done && tick < Math.ceil(CONFIG.maxTime / DT) + 4) {
    for (const event of events.filter(item => item.effectiveTick === tick)) {
      const accepted = sim.applyRecoveryEvent(event);
      assert.equal(accepted, true, `fixture paid event ${event.serverSeq} accepted at tick ${tick}`);
      assert.equal(hp()[event.payload.spot], event.payload.maxHP,
        `journal restore ${event.serverSeq} sets ${event.payload.spot} to frozen full HP at tick ${tick}`);
      paidApplied++;
    }
    const before = hp();
    sim.step(DT);
    const after = hp();
    if (v1) {
      for (const [id, value] of Object.entries(after)) assert.ok(value <= before[id] + 1e-9,
        `recovery-v1 free combat healing detected for ${id} at tick ${tick}`);
    }
    tick++;
  }
  assert.ok(sim.done, `wave ${wave} completed within simulator max time`);
  assert.ok(paidApplied <= 3);
  assert.equal(paidApplied, paidCount);
  for (const event of events) assert.equal(bySpot.get(event.payload.spot).instanceId, event.payload.instanceId);
  return { result: sim.result(), structuresHp: hp(), paidCount: paidApplied, ticks: tick };
}

it('records a fixed-seed legacy versus recovery-v1 runtime comparison', () => {
  const rows = [];
  for (const scenario of CASES) for (const crew of CREWS) {
    for (const policy of ['legacy', 'recovery-v1']) {
      const paidOptions = policy === 'legacy' ? [0] : [0, 3];
      for (const paidCount of paidOptions) {
        const run = simulate({ ...scenario, crew: crew.crew, policy, paidCount });
        rows.push({ stage: scenario.stage, wave: scenario.wave, seed: scenario.seed,
          crew: crew.label, policy, paidCount: run.paidCount,
          effectiveTicks: policy === 'recovery-v1' ? PAID_TICKS.slice(0, paidCount) : [],
          durationSeconds: run.result.time, survived: run.result.survived,
          shipsSunk: run.result.shipsSunk, islandHp: run.result.islandHp,
          structuresHp: run.structuresHp, simTicks: run.ticks });
      }
    }
  }
  for (const crew of CREWS) {
    const legacy = rows.find(row => row.stage === 'early' && row.crew === crew.label && row.policy === 'legacy');
    const recovery = rows.find(row => row.stage === 'early' && row.crew === crew.label
      && row.policy === 'recovery-v1' && row.paidCount === 0);
    assert.ok(legacy.structuresHp.wall_1 > 72, `${crew.label} legacy path preserves carpenter/workshop healing`);
    for (const id of ['wall_1', 'wall_2', 'wall_3', 'wall_4']) {
      assert.ok(recovery.structuresHp[id] <= 72, `recovery-v1 does not free-heal ${id} (${crew.label})`);
    }
  }
  assert.deepEqual(
    simulate({ ...CASES[1], crew: CREWS[0].crew, policy: 'recovery-v1', paidCount: 0 }),
    simulate({ ...CASES[1], crew: CREWS[0].crew, policy: 'recovery-v1', paidCount: 0 }),
    'fixed seed, build, and crew reproduce identical result and final structure HP',
  );
  const report = { generatedBy: 'recovery-balance-diagnostic.test.js', config: {
    tickSeconds: DT, weather: { ships: 1, fog: 0 }, build, towerHealth: true, pathing: true,
    towerObstacles: true, initialWallHpUnits: 600_000, initialTowerHpUnits: 1_000_000,
    structureMaxHp: Object.fromEntries(build.filter(item => item.kind === 'wall' || item.kind === 'cannon')
      .map(item => [item.id, maxHp(item)])),
    paidEvents: { type: 'structure_repaired', effectiveTicks: PAID_TICKS, maxSuccessfulCount: 3,
      hpUnits: 1_000_000, repairSeq: 1, chargedPrice: 0, chargedPriceIsFixtureOnly: true },
    crewProfiles: CREWS,
    cases: CASES,
    limits: ['pure deterministic combat sim only', 'solo/co-op are crew proxies, not distinct player-control simulations',
      'chargedPrice is fixture-only; no SQL pricing, authorization, or quota integration',
      'does not measure human fun, network races, or combat hit-report trust'],
  }, rows };
  if (process.env.WRITE_RECOVERY_DIAGNOSTIC === '1') {
    const outDir = new URL('../../../docs/evidence/T57-wave-recovery/', import.meta.url);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(new URL('report.json', outDir), `${JSON.stringify(report, null, 2)}\n`);
  }
  assert.equal(rows.length, 18);
});
