// A cloud save can replay accepted action IDs; arbitrary snapshots never reach the story engine.
export function validReplay(data) {
  return ['intro', 'world'].includes(data?.kind) && Array.isArray(data.actions)
    && data.actions.length <= 300 && data.actions.every(action =>
      typeof action === 'string' && /^[a-z0-9_]{1,40}$/.test(action));
}
