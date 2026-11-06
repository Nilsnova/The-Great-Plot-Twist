// Build identity must prefer Vercel, then local Git, then an explicit dev fallback.
import {describe,it,expect,vi} from 'vitest';
import {resolveBuildStamp} from '../scripts/build-stamp.js';

const now=()=>new Date('2026-11-06T16:00:00Z');
describe('build stamp',()=>{
  it('prefers the Vercel commit without invoking Git',()=>{
    const readGitSha=vi.fn(()=> 'abcdef0');
    expect(resolveBuildStamp({envSha:'1234567890abcdef',readGitSha,now})).toEqual({sha:'1234567',builtAt:'2026-11-06T16:00:00.000Z'});
    expect(readGitSha).not.toHaveBeenCalled();
  });
  it('uses local Git when the environment SHA is absent or invalid',()=>{
    for(const envSha of [undefined,'','not a commit'])expect(resolveBuildStamp({envSha,readGitSha:()=> 'abcdef0123\n',now}).sha).toBe('abcdef0');
  });
  it('uses dev when Git is unavailable or has no valid commit',()=>{
    expect(resolveBuildStamp({readGitSha:()=>{throw Error('not a repository');},now}).sha).toBe('dev');
    expect(resolveBuildStamp({readGitSha:()=>'',now}).sha).toBe('dev');
  });
});
