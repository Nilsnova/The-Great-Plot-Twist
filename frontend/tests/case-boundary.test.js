// Enforce the team boundary: screens cannot grow a transport or import the fake's rules.
import {it,expect} from 'vitest';
import {readdir,readFile} from 'node:fs/promises';
it('keeps transports and fake rule imports out of every case screen',async()=>{for(const name of await readdir(new URL('../src/screens/',import.meta.url))){if(!name.endsWith('.js'))continue;const source=await readFile(new URL('../src/screens/'+name,import.meta.url),'utf8');expect(source,name).not.toMatch(/\bfetch\s*\(|from\s+['"][^'"]*(?:adapter\/fake|online\/|net\/)/);}});
