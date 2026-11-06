// Regenerates only hashes from the server file. Never prints or copies reveal prose.
import {readFile,writeFile} from 'node:fs/promises';
import {fingerprint,protectedCaseLines} from './case-fingerprints.js';
const source=process.argv[2]??'../backend/content/secret/case.json';
const data=JSON.parse(await readFile(source,'utf8'));
const fingerprints=protectedCaseLines(data).map(({text,label})=>fingerprint(text,label));
await writeFile('tests/fixtures/reveal-fingerprints.json',JSON.stringify({source:'Server reveal section: reveal, closing, log-reader and last-beat lines. Hashes only.',fingerprints},null,2)+'\n');
console.log(`Recorded ${fingerprints.length} protected-line fingerprints without prose.`);
