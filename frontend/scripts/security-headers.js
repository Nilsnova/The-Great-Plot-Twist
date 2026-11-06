// Generate the strict proposal, or reproduce a validated deployed catch-all policy.
import {pathToFileURL} from 'node:url';
import {readPlatformPolicy} from './platform-policy.js';

const policyKey='Content-Security-Policy';
const reportKey='Content-Security-Policy-Report-Only';
const originPattern=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co$/;
const fixedHeaders={
  'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
};

function validateAddress(address){
  if(address===undefined||address==='')return '';
  if(typeof address!=='string'||!originPattern.test(address)){
    throw new TypeError('Expected a bare HTTPS single-label supabase.co origin');
  }
  return address;
}

function buildPolicy(address){
  const connections=address?` ${address} ${address.replace('https://','wss://')}`:'';
  return [
    "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
    "style-src 'self'", "style-src-elem 'self'", "style-src-attr 'none'",
    "img-src 'self'", "font-src 'self'", `connect-src 'self'${connections}`,
    "media-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}

function readPlatformHeaders(config,address){
  const blocks=config.headers;
  if(!Array.isArray(blocks)||blocks.length!==1||blocks[0]?.source!=='/(.*)'){
    throw new TypeError('Expected exactly one unconditional /(.*) platform header block');
  }
  const block=blocks[0];
  if(Object.keys(block).some(key=>!['source','headers'].includes(key))||!Array.isArray(block.headers)){
    throw new TypeError('Unsupported conditional platform header block');
  }
  const result={};
  const seen=new Set();
  for(const header of block.headers){
    const {key,value}=header??{};
    if(typeof key!=='string'||!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key)||
      typeof value!=='string'||/[\r\n]/.test(value)){
      throw new TypeError('Expected plain string platform headers');
    }
    if(seen.has(key.toLowerCase()))throw new TypeError('Duplicate platform header');
    seen.add(key.toLowerCase());
    Object.defineProperty(result,key,{value,enumerable:true});
  }
  const modes=[policyKey,reportKey].filter(key=>Object.hasOwn(result,key));
  if(modes.length!==1)throw new TypeError('Expected one enforcing or report-only CSP header');
  for(const [key,value] of Object.entries(fixedHeaders)){
    if(result[key]!==value)throw new TypeError(`Platform security header differs: ${key}`);
  }
  const policy=result[modes[0]];
  const deployedAddress=readPlatformPolicy(policy,validateAddress);
  if(address!==undefined&&validateAddress(address)!==deployedAddress){
    throw new TypeError('Public address differs from the deployed CSP');
  }
  return result;
}

export function buildSecurityHeaders(supabaseUrl,{platformConfig}={}){
  const address=validateAddress(supabaseUrl);
  if(platformConfig&&Object.hasOwn(platformConfig,'headers')){
    return readPlatformHeaders(platformConfig,supabaseUrl);
  }
  return {[policyKey]:buildPolicy(address),...fixedHeaders};
}

export function toVercelHeaders(headers){
  return {headers:[{source:'/(.*)',headers:Object.entries(headers).map(([key,value])=>({key,value}))}]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length>3)throw new TypeError('Usage: node scripts/security-headers.js [public-supabase-origin]');
  process.stdout.write(JSON.stringify(toVercelHeaders(buildSecurityHeaders(process.argv[2])),null,2)+'\n');
}
