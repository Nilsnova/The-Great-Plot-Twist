// Build identity must prefer Vercel, then local Git, then an explicit dev fallback.
import {describe,it,expect,vi} from 'vitest';
import {resolveBuildStamp} from '../scripts/build-stamp.js';

const now=()=>new Date('2026-11-06T16:00:00Z');
describe('build stamp',()=>{
  it('prefers the Vercel commit without invoking Git',()=>{
    const readGitSha=vi.fn(()=> 'abcdef0');
    expect(resolveBuildStamp({envSha:'1234567890abcdef',readGitSha,now})).toEqual({sha:'1234567',builtAt:'2026-11-06T16:00:00.000Z',environment:null});
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

describe('release context',()=>{
  it('marks a laptop build dirty without changing the fallback order',()=>{
    const options={readGitSha:()=> 'abcdef0123',readDirty:()=>true,now};
    expect(resolveBuildStamp(options).sha).toBe('abcdef0-dirty');
    expect(resolveBuildStamp({...options,readGitSha:()=>null}).sha).toBe('dev-dirty');
    expect(resolveBuildStamp({...options,envSha:'1234567890'}).sha).toBe('1234567');
  });
  it('accepts only preview and production environment words',()=>{
    for(const envName of ['preview','production']){
      expect(resolveBuildStamp({envName,now}).environment).toBe(envName);
    }
    for(const envName of ['development','private value',null]){
      expect(resolveBuildStamp({envName,now}).environment).toBeNull();
    }
    expect(resolveBuildStamp({readDirty:()=>{throw Error('no Git');},now}).sha).toBe('dev');
  });
});

import {performanceCopy} from '../src/build/format.js';
it('includes the public identity and time in performance copies',()=>{
  const stamp={sha:'abcdef0-dirty',builtAt:'2026-11-06T16:00:00.000Z',environment:'preview'};
  expect(performanceCopy(stamp,'Frames per second: 60')).toBe(
    'Build abcdef0-dirty · preview\nBuilt at: 2026-11-06T16:00:00.000Z\nFrames per second: 60'
  );
});
