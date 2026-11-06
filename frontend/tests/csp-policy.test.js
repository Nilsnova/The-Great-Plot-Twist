import {describe,it,expect} from 'vitest';
import {proposedCsp} from '../scripts/csp-policy.js';
const directives=Object.fromEntries(proposedCsp.split('; ').map(line=>{const [key,...values]=line.split(' ');return [key,values];}));
describe('proposed production CSP',()=>{
  it('allows only self and the two approved connection origins',()=>{
    expect(directives['connect-src']).toEqual(["'self'",'https://uqcjihigqjgyuafrfbnp.supabase.co','wss://uqcjihigqjgyuafrfbnp.supabase.co']);
    expect(proposedCsp).not.toMatch(/unsafe-inline|unsafe-eval|blob:|data:|\*/);
  });
  it('blocks inline scripts, style text, framing, workers and remote media',()=>{
    for(const key of ['script-src-attr','style-src-attr','frame-src','frame-ancestors','object-src','worker-src','media-src','base-uri'])expect(directives[key]).toEqual(["'none'"]);
    for(const key of ['script-src','style-src','style-src-elem','img-src','font-src'])expect(directives[key]).toEqual(["'self'"]);
  });
});
