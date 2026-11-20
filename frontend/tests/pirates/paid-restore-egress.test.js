// Two production journal consumers must let a live occupant escape a restored tower.
import {expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createWave} from '../../src/pirates/sim.js';
import {simulationInputFromJournal} from '../../src/pirates/recovery-transport.js';
import {createReplayDriver, createWaveReplay} from '../../src/pirates/wave-replay.js';
import {towerEdgeDistance} from '../../src/pirates/tower-obstacles.js';

const tower = {id:'cannon_1',spot:'cannon_1',instanceId:'egress-cannon',kind:'cannon',level:1,
  x:0,z:3.5,hpUnits:0,maxHP:80,repairSeq:0};

function consumer() {
  const wave = createWave({seed:5,wave:3,island:{hp:5000},defenses:[tower],recoveryStructures:[tower],
    towerHealth:true,pathing:true,towerObstacles:true,recoveryVersion:1,waveProtocol:2});
  const journal = createWaveReplay(), driver = createReplayDriver(journal);
  expect(journal.addPage({headSeq:0,sealedThroughTick:0,events:[]})).toBe(true);
  return {wave,journal,step(tick) {
    if (tick > journal.sealedThroughTick) {
      expect(journal.addPage({headSeq:journal.headSeq,sealedThroughTick:tick,events:[]})).toBe(true);
    }
    let events = [];
    expect(driver.advanceThrough(tick, (_tick, rows) => {
      events = wave.step(.05, rows.map(simulationInputFromJournal).filter(Boolean));
    })).toBe(true);
    return events;
  }};
}

it('two replay consumers observe actual live egress after an ordered paid restore', () => {
  const first = consumer();
  first.step(0);
  let restoreTick = null, occupyingId = null;
  for (let tick=1; tick<6000 && !first.wave.done; tick++) {
    first.step(tick);
    const occupant = first.wave.state().boarders.find(item =>
      Math.abs(item.x-tower.x)<=.25 && Math.abs(item.z-tower.z)<=.25);
    if (!occupant) continue;
    occupyingId = occupant.id;
    restoreTick = tick+1;
    break;
  }
  expect(occupyingId, 'the fixture must first observe a live boarder inside the ruin').not.toBeNull();
  const restored = {serverSeq:1,effectiveTick:restoreTick,type:'structure_repaired',participantToken:null,
    payload:{spot:tower.spot,instanceId:tower.instanceId,hpUnits:1000000,maxHP:80,repairSeq:1}};
  const page = {headSeq:1,sealedThroughTick:restoreTick+120,events:[restored]};
  expect(first.journal.addPage(page)).toBe(true);
  // Reconnect independently reconstructs the accepted prefix instead of copying another sim's state.
  const reconnected = consumer();
  expect(reconnected.journal.addPage(page)).toBe(true);
  for (let tick=0; tick<restoreTick; tick++) reconnected.step(tick);
  const escaped = [false,false], fired = [false,false], firstEscape = [null,null];
  const consumers = [first,reconnected];
  for (let tick=restoreTick; tick<=restoreTick+120; tick++) {
    consumers.forEach((client,index) => {
      const events = client.step(tick), state = client.wave.state();
      const standing = state.towers.find(item => item.id===tower.id);
      const occupant = state.boarders.find(item => item.id===occupyingId);
      if (tick===restoreTick) expect(standing).toMatchObject({hp:80,broken:false});
      fired[index] ||= events.some(item => item.type==='cannon_fired' && item.cannonId===tower.id);
      // A dead/disappeared boarder or a destroyed tower cannot satisfy this assertion.
      if (!escaped[index] && occupant && standing.hp>0 && towerEdgeDistance(occupant,tower)>0) {
        escaped[index] = true;
        firstEscape[index] = {tick,boarderId:occupyingId,x:occupant.x,z:occupant.z,
          standingTowerHP:standing.hp,edgeDistance:towerEdgeDistance(occupant,tower)};
      }
    });
    expect(reconnected.wave.state().boarders).toEqual(first.wave.state().boarders);
    expect(reconnected.wave.state().towers).toEqual(first.wave.state().towers);
  }
  expect(escaped).toEqual([true,true]);
  expect(fired).toEqual([true,true]);
  if (process.env.WRITE_T60_EGRESS_DIAGNOSTIC==='1') {
    const source='3bdd8eda16470795fdedd68c42fffab54e5f2ced';
    const root=fileURLToPath(new URL('../../../',import.meta.url));
    execFileSync('git',['diff','--quiet',source,'--','frontend/src'],{cwd:root});
    expect(execFileSync('git',['ls-files','--others','--exclude-standard','--','frontend/src'],{cwd:root,encoding:'utf8'})).toBe('');
    const folder = fileURLToPath(new URL('../../../docs/evidence/T60-structure-recovery/current-native-20261119/',import.meta.url));
    mkdirSync(folder,{recursive:true});
    const report = {sourceCommit:source,
      measurementCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
      productionSourceMatchesBaseline:true,
      testSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
      restoreTick,firstEscape,independentReplaysAgree:true,bothRestoredTowersFired:true,
      limit:'Production replay/simulation with a synthetic sealed paid event; no provider/browser payment claim.'};
    writeFileSync(`${folder}/paid-restore-egress.json`,`${JSON.stringify(report,null,2)}\n`);
  }
});
