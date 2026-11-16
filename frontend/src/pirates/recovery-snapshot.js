// Validate and adapt a frozen recovery-v1 wave snapshot. Used by controller.js, never by local island reads.

const FULL_HP_UNITS = 1_000_000;
const SUPPORTED_KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isPoint = value => typeof value === 'number' && Number.isFinite(value);

function freezeTree(value) {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freezeTree(item);
  return Object.freeze(value);
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function readStructure(row) {
  return isObject(row) && typeof row.spot === 'string' && row.spot.length > 0
    && typeof row.instanceId === 'string' && row.instanceId.length > 0 && SUPPORTED_KINDS.has(row.kind)
    && Number.isInteger(row.level) && row.level >= 1 && row.level <= 5
    && isPoint(row.x) && isPoint(row.z)
    && Number.isInteger(row.hpUnits) && row.hpUnits >= 0 && row.hpUnits <= FULL_HP_UNITS
    && Number.isInteger(row.repairSeq) && row.repairSeq >= 0 && row.repairSeq <= 1_000_000_000
    && isPoint(row.maxHP) && row.maxHP > 0;
}

/** Return an owned, frozen snapshot only when its version and every structure row are valid. */
export function readRecoverySnapshot(snapshot, waveId) {
  const copy = cloneJson(snapshot);
  if (!isObject(copy) || copy.recoveryVersion !== 1 || copy.waveProtocol !== 2 || copy.configVersion !== 1
    || copy.waveId !== waveId || typeof copy.islandEpoch !== 'string' || !copy.islandEpoch
    || !Number.isFinite(copy.seed) || typeof copy.startsAt !== 'string' || !Number.isFinite(Date.parse(copy.startsAt))
    || !isObject(copy.weather) || !Array.isArray(copy.rules)
    || !isObject(copy.createWave) || !Array.isArray(copy.createWave.defenses)
    || !Array.isArray(copy.structures) || !copy.structures.every(readStructure)) return null;
  if (new Set(copy.structures.map(row => row.spot)).size !== copy.structures.length
    || new Set(copy.structures.map(row => row.instanceId)).size !== copy.structures.length) return null;
  const rules = new Set(copy.rules);
  if (!rules.has('structure_recovery')) return null;
  const rows = new Map(copy.structures.map(row => [row.spot, row]));
  const defenseIds = new Set();
  for (const defense of copy.createWave.defenses) {
    if (!isObject(defense) || typeof defense.id !== 'string' || defenseIds.has(defense.id)) return null;
    defenseIds.add(defense.id);
    if (SUPPORTED_KINDS.has(defense.kind) && rows.get(defense.id)?.kind !== defense.kind) return null;
  }
  return freezeTree(copy);
}

/** Build the sim's defense list from the frozen createWave input and authoritative HP vector. */
export function recoveryWaveDefenses(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.createWave?.defenses) || !Array.isArray(snapshot.structures)) return null;
  const rows = new Map(snapshot.structures.map(row => [row.spot, row]));
  const used = new Set();
  const defenses = snapshot.createWave.defenses.map(defense => {
    if (!SUPPORTED_KINDS.has(defense?.kind)) return defense;
    const row = rows.get(defense.id);
    if (!row) return null;
    used.add(row.spot);
    return { ...defense, ...row, id: row.spot };
  });
  for (const row of snapshot.structures) {
    if (!used.has(row.spot)) defenses.push({ ...row, id: row.spot });
  }
  return defenses;
}
