// Finds protected text with rolling hashes, so even fingerprint prefixes reveal no words.
import {createHash} from 'node:crypto';
import {headHash} from './case-fingerprints.js';
export function normalizeSpoilerSource(text){return text.replace(/\\u\{([0-9a-f]+)\}/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16))).replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,(_,a,b)=>String.fromCharCode(parseInt(a??b,16))).replace(/\\([nrt'"\\])/g,(_,char)=>({n:'\n',r:'\r',t:'\t'}[char]??char));}
export function containsFingerprint(source,entry){
 const text=normalizeSpoilerSource(source);
 if(entry.prefix){let at=text.indexOf(entry.prefix);while(at!==-1){if(matches(text.slice(at,at+entry.length),entry))return true;at=text.indexOf(entry.prefix,at+1);}return false;}
 const width=entry.headLength;if(!width||text.length<entry.length)return false;
 let power=1;for(let i=1;i<width;i++)power=Math.imul(power,31)>>>0;
 let rolling=headHash(text.slice(0,width));
 for(let at=0;at<=text.length-entry.length;at++){
  if(rolling===entry.headHash&&matches(text.slice(at,at+entry.length),entry))return true;
  rolling=(Math.imul((rolling-Math.imul(text.charCodeAt(at),power))>>>0,31)+text.charCodeAt(at+width))>>>0;
 }return false;
}
function matches(candidate,entry){return candidate.length===entry.length&&createHash('sha256').update(candidate).digest('hex')===entry.sha256;}
export function hasEliminationData(source){return /(?:\bclears|["'`]clears["'`])\s*:\s*[^\]}]{0,60}[`'"][a-z_]+[`'"]/.test(normalizeSpoilerSource(source));}
