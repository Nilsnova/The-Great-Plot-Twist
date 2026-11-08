// Selection is independent of transport, session state and the case's rules.
import {describe,it,expect} from 'vitest';
import {adapterChoice,hasSignInReturn} from '../src/adapter/selection.js';

describe('adapter selection',()=>{
  it.each([
    ['',false,'online'],['?demo=1',false,'unavailable'],
    ['?case=local',false,'unavailable'],['?case=local',true,'local'],
    ['?case=local&demo=1',false,'local'],['?case=other',true,'online'],
  ])('selects %s in dev=%s as %s',(search,dev,expected)=>{
    expect(adapterChoice(search,dev)).toBe(expected);
  });
  it('recognizes a sign-in return without copying its values',()=>{
    expect(hasSignInReturn('?code=not-stored')).toBe(true);
    expect(hasSignInReturn('?error=not-stored')).toBe(true);
    expect(hasSignInReturn('?error_description=not-a-return')).toBe(false);
  });
});
