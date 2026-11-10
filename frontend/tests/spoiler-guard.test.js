// The production guard recognises exact and escaped sentences, without private prose in tests.
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {containsFingerprint} from '../scripts/spoiler-guard.js';
describe('production spoiler fingerprints',()=>{
  it('detects exact protected text and escaped source strings',()=>{const text="A private 'example' line.",fingerprint={prefix:text.slice(0,14),length:text.length,sha256:createHash('sha256').update(text).digest('hex')};expect(containsFingerprint('before '+text+' after',fingerprint)).toBe(true);expect(containsFingerprint(text.replaceAll("'","\\'"),fingerprint)).toBe(true);expect(containsFingerprint('A different sentence.',fingerprint)).toBe(false);});
});

import {fingerprint,protectedCaseLines} from '../scripts/case-fingerprints.js';
import {hasEliminationData} from '../scripts/spoiler-guard.js';
it('protects lines using hashes only, including unicode and escaped strings',()=>{const text='A harmless 🌊 example with a newline.\nNext line.',entry=fingerprint(text,'dummy');expect(Object.hasOwn(entry,'prefix')).toBe(false);expect(containsFingerprint('before '+text+' after',entry)).toBe(true);expect(containsFingerprint(JSON.stringify(text),entry)).toBe(true);expect(containsFingerprint(text.replace('example','different'),entry)).toBe(false);});
it('rejects baked elimination literals but allows empty and runtime lists',()=>{expect(hasEliminationData('clears:[`example_suspect`]')).toBe(true);expect(hasEliminationData('"clears": ["example_suspect"]')).toBe(true);expect(hasEliminationData('clears:[]')).toBe(false);expect(hasEliminationData('clears:model.clears')).toBe(false);});
it('collects every reveal, closing, log and last beat without other case data',()=>{const data={reveal:{lines:Array.from({length:6},(_,i)=>({text:`Example ${i}`})),closing_lines:Object.fromEntries(['a','b','c','d'].map(id=>[id,{text:'A safe closing.'}])),log_reader_line:{text:'A safe log line.'},last_beat:{text:'A safe last beat.'}}};expect(protectedCaseLines(data)).toHaveLength(12);});
