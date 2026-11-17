// Forward actual combat HP, binding each wave object to the island it started on.
export function createCorePublisher({controller, context, publish}) {
  let boundWave = null, captured = null;
  return () => {
    const source = controller(), wave = source?.wave;
    if (!wave || wave.finished || wave.done || typeof wave.info?.waveId !== 'string' || !wave.info.waveId) return;
    if (boundWave !== wave) { boundWave = wave; captured = null; }
    if (!captured) {
      const target = context();
      if (typeof target?.key !== 'string' || !target.key) return;
      captured = {key: target.key, epoch: target.epoch ?? null};
    }
    const state = source.state;
    if (!state || typeof state.islandHp !== 'number' || typeof state.maxIslandHp !== 'number') return;
    // The model owns finite/range/tick validation. A later travel cannot rebind this wave.
    return publish({waveId: wave.info.waveId, contextKey: captured.key,
      epoch: wave.info.initialSnapshot?.islandEpoch ?? captured.epoch,
      tick: wave.ticks, hp: state.islandHp, max: state.maxIslandHp});
  };
}
