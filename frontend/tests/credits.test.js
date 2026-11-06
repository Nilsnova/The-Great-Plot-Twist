// Keep the first contribution simple: one human-owned credit row per teammate.
import {it,expect} from 'vitest';
import {teamMembers} from '../src/shell/team.js';
it('credits Nils and leaves one editable placeholder for each of the other three teammates',()=>{
  expect(teamMembers).toHaveLength(4);
  expect(teamMembers[0]).toBe('Nils Lenke');
  expect(teamMembers.every(name=>typeof name==='string'&&name.trim().length>0&&!/\d{5,}/.test(name))).toBe(true);
});
