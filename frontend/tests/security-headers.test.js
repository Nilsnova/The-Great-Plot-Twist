// Pin the strict policy and reject origins that would broaden the network boundary.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildSecurityHeaders,toVercelHeaders} from '../scripts/security-headers.js';

const address='https://example-project.supabase.co';
const basePolicy=[
  "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
  "style-src 'self'", "style-src-elem 'self'", "style-src-attr 'none'",
  "img-src 'self'", "font-src 'self'", "connect-src 'self'",
  "media-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const base={
  'Content-Security-Policy':basePolicy,'X-Frame-Options':'DENY',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
};
const platform=headers=>({headers:toVercelHeaders(headers).headers});

describe('security headers',()=>{
  it('pins every default header without a project address',()=>{
    expect(buildSecurityHeaders()).toEqual(base);
    expect(buildSecurityHeaders('')).toEqual(base);
  });
  it('adds only the validated HTTPS and derived WSS origins',()=>{
    expect(buildSecurityHeaders(address)).toEqual({...base,'Content-Security-Policy':
      basePolicy.replace("connect-src 'self'",`connect-src 'self' ${address} wss://example-project.supabase.co`)});
  });
  it.each([
    null,42,{},' ','https://example.supabase.co/','https://example.supabase.co/path',
    'https://user@example.supabase.co','https://example.supabase.co?x=1',
    'https://example.supabase.co#x','https://example.supabase.co:443','http://example.supabase.co',
    'wss://example.supabase.co','https://nested.example.supabase.co','https://example.supabase.co.evil.test',
    'https://example-supabase.co','https://-example.supabase.co','https://example-.supabase.co',
    'https://example.supabase.co\n',"https://example.supabase.co; script-src *",
  ])('rejects invalid public address %j',value=>{
    expect(()=>buildSecurityHeaders(value)).toThrow(TypeError);
  });
  it('reproduces enforcing and report-only platform policy exactly',()=>{
    const enforcing=buildSecurityHeaders(address);
    expect(buildSecurityHeaders(undefined,{platformConfig:platform(enforcing)})).toEqual(enforcing);
    const {'Content-Security-Policy':policy,...others}=enforcing;
    const reportOnly={'Content-Security-Policy-Report-Only':policy,...others};
    expect(buildSecurityHeaders(address,{platformConfig:platform(reportOnly)})).toEqual(reportOnly);
  });
  it('fails closed on a mismatching address or weakened platform policy',()=>{
    const config=platform(buildSecurityHeaders(address));
    expect(()=>buildSecurityHeaders('https://different.supabase.co',{platformConfig:config})).toThrow(TypeError);
    expect(()=>buildSecurityHeaders('invalid',{platformConfig:config})).toThrow(TypeError);
    for(const changed of [
      {...base,'Content-Security-Policy':basePolicy.replace("script-src 'self'",'script-src *')},
      {...base,'X-Frame-Options':'SAMEORIGIN'},
      {...base,'Content-Security-Policy-Report-Only':basePolicy},
    ])expect(()=>buildSecurityHeaders(undefined,{platformConfig:platform(changed)})).toThrow(TypeError);
  });
  it('preserves additional platform headers without changing their values or order',()=>{
    const headers={...base,'Strict-Transport-Security':'max-age=31536000; includeSubDomains'};
    expect(toVercelHeaders(buildSecurityHeaders(undefined,{platformConfig:platform(headers)})))
      .toEqual(platform(headers));
  });
  it('mirrors the deployed compact policy with inherited self-only directives',()=>{
    const policy=["default-src 'self'","script-src 'self'","style-src 'self'","img-src 'self'",
      "connect-src 'self'","object-src 'none'","base-uri 'none'","form-action 'self'",
      "frame-ancestors 'none'"].join('; ');
    const headers={...base,'Content-Security-Policy':policy};
    expect(buildSecurityHeaders(undefined,{platformConfig:platform(headers)})).toEqual(headers);
    for(const extra of ['; connect-src *',"; script-src-attr 'unsafe-inline'",'; worker-src blob:']){
      expect(()=>buildSecurityHeaders(undefined,{platformConfig:platform({...headers,
        'Content-Security-Policy':policy+extra})})).toThrow(TypeError);
    }
  });
  it('rejects missing, duplicated and scoped deployment security blocks',()=>{
    const block=toVercelHeaders(base).headers[0];
    for(const headers of [[],[block,block],[{...block,source:'/game'}],
      [{...block,headers:block.headers.slice(1)}],
      [{...block,headers:[...block.headers,block.headers[0]]}],
    ])expect(()=>buildSecurityHeaders(undefined,{platformConfig:{headers}})).toThrow(TypeError);
  });
  it('emits the documented Vercel JSON from the CLI without environment defaults',()=>{
    const run=argument=>JSON.parse(execFileSync(process.execPath,
      ['scripts/security-headers.js',...argument],{encoding:'utf8',env:{}}));
    expect(run([])).toEqual(toVercelHeaders(base));
    expect(run([address])).toEqual(toVercelHeaders(buildSecurityHeaders(address)));
  });
  it('matches actual platform headers when present and otherwise uses the explicit proposal',()=>{
    const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
    const headers=buildSecurityHeaders(undefined,{platformConfig:config});
    if(Object.hasOwn(config,'headers'))expect(toVercelHeaders(headers).headers).toEqual(config.headers);
    else expect(headers).toEqual(base);
  });
});
