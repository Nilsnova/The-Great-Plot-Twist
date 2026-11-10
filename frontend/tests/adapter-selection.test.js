// Selection is independent of transport and session state.
import {describe,it,expect} from 'vitest';
import {adapterChoice,hasSignInReturn} from '../src/adapter/selection.js';

describe('adapter selection',()=>{
  it.each([
    ['',false,'online'],['?demo=1',false,'unavailable'],
    ['?adapter=local',false,'unavailable'],['?adapter=local',true,'local'],
    ['?adapter=local&demo=1',false,'local'],['?adapter=other',true,'online'],['?case=local',true,'online'],
  ])('selects %s in dev=%s as %s',(search,dev,expected)=>{
    expect(adapterChoice(search,dev)).toBe(expected);
  });
  it('recognizes a sign-in return without copying its values',()=>{
    expect(hasSignInReturn('?code=not-stored')).toBe(true);
    expect(hasSignInReturn('?error=not-stored')).toBe(true);
    expect(hasSignInReturn('?error_description=not-a-return')).toBe(false);
  });
});
