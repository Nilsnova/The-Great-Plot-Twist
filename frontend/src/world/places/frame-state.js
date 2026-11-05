// update(dt) works on its own; main may supply its live frame state as a second argument.
import { getWeather } from '../weather.js';
export function createFrameState(ctx, spawn) {
  let time = 0;
  return (dt, state) => {
    if (state) return state;
    const supplied = ctx.readState?.(); if (supplied) return supplied;
    time += dt;
    return { time, player: { x: spawn[0], y: 1.03, z: spawn[1] }, night: 0, weather: getWeather() };
  };
}
