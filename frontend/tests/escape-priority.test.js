// Closing a view never skips a cinematic underneath it or pauses at the same time.
import {it,expect} from 'vitest';
import {escapePriority} from '../src/shell/escape.js';
it('closes the top panel, then skips a cinematic, then pauses',()=>{
  expect(escapePriority({panel:true,cinematic:true,playing:true})).toBe('close_panel');
  expect(escapePriority({cinematic:true,playing:true})).toBe('skip_cinematic');
  expect(escapePriority({playing:true})).toBe('pause');
  expect(escapePriority()).toBe('none');
});
