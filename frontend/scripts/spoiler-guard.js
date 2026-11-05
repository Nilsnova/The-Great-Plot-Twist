// Checks exact reveal fingerprints without keeping the protected sentences in client source.
import {createHash} from 'node:crypto';
export function containsFingerprint(text,fingerprint) {
  const normalized=text.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/\\(['"\\])/g,'$1');
  let position=normalized.indexOf(fingerprint.prefix);
  while(position!==-1){const candidate=normalized.slice(position,position+fingerprint.length),hash=createHash('sha256').update(candidate).digest('hex');if(hash===fingerprint.sha256)return true;position=normalized.indexOf(fingerprint.prefix,position+1);}
  return false;
}
