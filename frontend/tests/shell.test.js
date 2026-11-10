// Shell state; no DOM or server is required.
import {describe,it,expect} from 'vitest';
import {shellTransition} from '../src/shell/logic.js';
describe('game shell',()=>{
  it('pauses only during play and returns to play explicitly',()=>{
    expect(shellTransition('playing','pause')).toBe('pause');
    expect(shellTransition('title','pause')).toBe('title');
    expect(shellTransition('settings','pause')).toBe('pause');
    expect(shellTransition('credits','play')).toBe('playing');
    expect(shellTransition('pause','unknown')).toBe('pause');
  });
});
