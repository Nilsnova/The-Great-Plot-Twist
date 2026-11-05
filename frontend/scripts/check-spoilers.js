// Runs after every production build. Reports file/label only, never secret reveal prose.
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {containsFingerprint} from './spoiler-guard.js';
const {fingerprints}=JSON.parse(await readFile('tests/fixtures/reveal-fingerprints.json','utf8'));
async function files(path){const result=[];for(const entry of await readdir(path,{withFileTypes:true})){const name=join(path,entry.name);if(entry.isDirectory())result.push(...await files(name));else if(/\.(js|css|html|json|map)$/.test(entry.name))result.push(name);}return result;}
const paths=await files('dist');
for(const path of paths){const text=await readFile(path,'utf8');for(const fingerprint of fingerprints)if(containsFingerprint(text,fingerprint))throw new Error(`Protected ${fingerprint.label} sentence found in ${path}`);}
console.log(`Spoiler guard: ${paths.length} built text files contain neither protected reveal sentence.`);
