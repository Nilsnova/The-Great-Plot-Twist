// Scans production output for protected prose and baked suspect eliminations, never prints the text.
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {containsFingerprint,hasEliminationData} from './spoiler-guard.js';
import {fingerprint,protectedCaseLines} from './case-fingerprints.js';
const committed=JSON.parse(await readFile('tests/fixtures/reveal-fingerprints.json','utf8')).fingerprints;
let fingerprints=[...committed];
try{
 const data=JSON.parse(await readFile('../backend/content/secret/case.json','utf8'));
 const current=protectedCaseLines(data).map(({text,label})=>fingerprint(text,label));
 if(current.some(entry=>!committed.some(saved=>saved.sha256===entry.sha256)))throw new Error('Committed reveal fingerprints need regeneration.');
 fingerprints=[...new Map([...committed,...current].map(entry=>[entry.sha256,entry])).values()];
}catch(error){if(error.code!=='ENOENT')throw error;}
async function files(path){const result=[];for(const entry of await readdir(path,{withFileTypes:true})){const name=join(path,entry.name);if(entry.isDirectory())result.push(...await files(name));else if(/\.(js|css|html|json|map)$/.test(entry.name))result.push(name);}return result;}
const paths=await files(process.argv[2]??'dist');
for(const path of paths){const text=await readFile(path,'utf8');if(path.endsWith('.js')&&hasEliminationData(text))throw new Error(`Suspect elimination data found in ${path}`);for(const entry of fingerprints)if(containsFingerprint(text,entry))throw new Error(`Protected ${entry.label} line found in ${path}`);}
console.log(`Spoiler guard: ${paths.length} text files, ${fingerprints.length} protected lines, no suspect elimination data.`);
