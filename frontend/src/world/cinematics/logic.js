// Pure timing and light projection. These helpers never mutate game progress.
export const durations = {three_lights:8,fog_lift:5,schooner_reveal:6,unmask:5,relighting:8};
export const cinematicNames = Object.keys(durations);
export function createTimeline(name,{reducedMotion=false}={}) {
  if (!Object.hasOwn(durations,name)) throw new Error(`Unknown cinematic: ${name}`);
  let elapsed = reducedMotion ? durations[name] : 0;
  return { get progress() { return Math.min(1,elapsed/durations[name]); }, get done() { return elapsed>=durations[name]; },
    tick(dt) { if (Number.isFinite(dt)) elapsed+=Math.max(0,dt); }, skip() { elapsed=durations[name]; } };
}
export function projectLights(registry,ids) {
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate light');
  return ids.map(id=>{
    for (const place of Object.values(registry)) {
      const light=place.lights.find(light=>light.id===id);
      if (light) return {id,beamOrigin:{...light.beamOrigin},x:Math.round(place.chart[0]+light.beamOrigin.x*.5),y:Math.round(place.chart[1]-light.beamOrigin.y*.5)};
    }
    throw new Error(`Unknown light: ${id}`);
  });
}
