// Unknown canonical source suppresses reporting; only an omitted routing decision uses the world default.
import {it,expect} from 'vitest';
import {resolvePresencePlace} from '../src/world/experience.js';
it('preserves an explicit unknown room and the exact server nonce without static fallback',()=>{
 expect(resolvePresencePlace('home_islet',()=>null)).toBeNull();
 expect(resolvePresencePlace('home_islet',()=> 'isle_k7q2m_0123456789abcdef01234567')).toBe('isle_k7q2m_0123456789abcdef01234567');
 expect(resolvePresencePlace('home_islet',()=>{throw new Error('unknown');})).toBeNull();
 expect(resolvePresencePlace('saltreach_harbor',()=>undefined)).toBe('saltreach_harbor');
});
