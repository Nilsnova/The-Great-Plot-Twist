// Forward actual combat HP, binding each wave object to the island it started on.
export function createCorePublisher({controller, context, publish}) {
  let boundWave = null, captured = null;
  return () => {
    const source = controller(), wave = source?.wave;
    if (!wave || wave.finished || wave.done || typeof wave.info?.waveId !== 'string' || !wave.info.waveId) return;
    if (boundWave !== wave) { boundWave = wave; captured = null; }
    const target = context();
    if (!captured) {
      if (typeof target?.key !== 'string' || !target.key) return;
      captured = {key: target.key, epoch: target.epoch ?? null, islandIdentity: target.islandIdentity ?? null};
    } else if (target?.key !== captured.key && captured.islandIdentity
        && target?.islandIdentity === captured.islandIdentity && target.epoch === captured.epoch
        && target.rejoin?.contextKey === target.key && target.rejoin.waveId === wave.info.waveId) {
      // Only a successful current-wave read after landing can authorize the same retained wave.
      // Identity includes island code, epoch and reset generation, so another island/reset cannot borrow it.
      captured = {...captured, key: target.key};
    }
    const state = source.state;
    if (!state || typeof state.islandHp !== 'number' || typeof state.maxIslandHp !== 'number') return;
    // The model owns finite/range/tick validation. Travel alone never rebinds this wave.
    return publish({waveId: wave.info.waveId, contextKey: captured.key,
      epoch: wave.info.initialSnapshot?.islandEpoch ?? captured.epoch,
      tick: wave.ticks, hp: state.islandHp, max: state.maxIslandHp});
  };
}
