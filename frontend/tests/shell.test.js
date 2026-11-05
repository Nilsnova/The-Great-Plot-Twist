// Shell state and local-save validation; no DOM or server is required.
import {describe,it,expect} from 'vitest';
import {hasLocalIntro,shellTransition} from '../src/shell/logic.js';
describe('game shell',()=>{
  it('accepts only bounded versioned move journals',()=>{
    expect(hasLocalIntro(JSON.stringify({version:1,actions:['to_desk']}))).toBe(true);
    for(const value of [null,'bad','{}','{"version":2,"actions":[]}','{"version":1,"actions":[2]}']) expect(hasLocalIntro(value)).toBe(false);
    expect(hasLocalIntro(JSON.stringify({version:1,actions:Array(1001).fill('x')}))).toBe(false);
  });
  it('pauses only during play and returns to play explicitly',()=>{
    expect(shellTransition('playing','pause')).toBe('pause');
    expect(shellTransition('title','pause')).toBe('title');
    expect(shellTransition('settings','pause')).toBe('pause');
    expect(shellTransition('credits','play')).toBe('playing');
    expect(shellTransition('pause','unknown')).toBe('pause');
  });
});
