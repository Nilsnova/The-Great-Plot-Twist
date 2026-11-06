// G24 normal-suite gate and deliberately bad copy. No private case prose is used.
import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {collect,displayJavascriptStrings,htmlStrings,isDisplayCandidate,javascriptStrings,jsonStrings,reportOnly} from '../../scripts/text-lint/extract.mjs';
import {lintRepository,repositoryRoot,revealsIdentity} from '../../scripts/text-lint/index.mjs';
import {checkText,fillTemplate} from '../../scripts/text-lint/rules.mjs';

const policy = JSON.parse(await readFile(join(repositoryRoot,'scripts/text-lint/policy.json'),'utf8'));
const words = new Set((await readFile(join(repositoryRoot,'scripts/text-lint/words.txt'),'utf8')).split(/\s+/));
const issues = (text,extra={})=>checkText({text,file:'fixture.js',line:1},{policy,words,...extra});
const roots = [];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'g24-text-')); roots.push(root);
  for (const dir of ['scripts/text-lint','frontend/src/online','frontend/public','frontend/tests/fixtures','backend/content/secret'])
    await mkdir(join(root,dir),{recursive:true});
  await writeFile(join(root,'scripts/text-lint/policy.json'),JSON.stringify(policy));
  await writeFile(join(root,'scripts/text-lint/words.txt'),[...words].join('\n'));
  await writeFile(join(root,'backend/content/partners.json'),JSON.stringify({max_characters:80,placeholders:{minutes:'A number'},
    events:{ready:{placeholders_used:['minutes'],lines:{any:['Back in {minutes} minutes.']}}}}));
  await writeFile(join(root,'backend/content/names.json'),JSON.stringify({adjectives:['Noble'],nouns:['Gull']}));
  await writeFile(join(root,'frontend/tests/fixtures/reveal-fingerprints.json'),JSON.stringify({fingerprints:[]}));
  // Invalid data proves neither collection nor spoiler checks read anything under secret/.
  await writeFile(join(root,'backend/content/secret/poison.json'),'not JSON');
  await writeFile(join(root,'frontend/src/copy.js'),"const label = 'Back at sea.';");
  return root;
}

describe('G24 player-facing text',()=>{
  it('runs the repository linter as part of ordinary npm test and rejects editable errors',async()=>{
    const result = await lintRepository();
    expect(result.records).toBeGreaterThan(0); expect(result.files).toBeGreaterThan(0);
    expect(result.diagnostics.filter(issue=>!issue.reportOnly)).toEqual([]);
  });
  it('finds misspelled new vocabulary instead of silently learning it',()=>{
    expect(issues('A mispelled captain.').some(issue=>issue.rule==='spelling')).toBe(true);
    expect(issues('A quiet captain.')).toEqual([]);
    const records = javascriptStrings("node('button', '', 'mispelled');").filter(isDisplayCandidate);
    expect(records.some(record=>record.text === 'mispelled')).toBe(true);
  });
  it('rejects all banned dash forms including double-hyphen prose',()=>{
    for (const text of ['Wait—then go.','Wait–then go.','Wait--then go.','--we are waiting']) {
      expect(isDisplayCandidate({text})).toBe(true);
      expect(issues(text).some(issue=>issue.rule==='dash')).toBe(true);
    }
    expect(isDisplayCandidate({text:'--chart-scale'})).toBe(false);
    expect(isDisplayCandidate({text:'--wait',context:'label:'})).toBe(true);
  });
  it('keeps American spelling and canonical company names distinct',()=>{
    expect(issues('Colour highlights').some(issue=>issue.rule==='dialect')).toBe(true);
    expect(issues('Greyfathom Salvage')).toEqual([]);
    expect(issues('Saltreach harbour').some(issue=>issue.rule==='name')).toBe(true);
  });
  it('checks feature capitalization, near-miss names and equivalent apostrophes',()=>{
    expect(issues('Island exchange').some(issue=>issue.rule==='name')).toBe(true);
    expect(issues('Saltrech Harbor').some(issue=>issue.rule==='name')).toBe(true);
    expect(issues('Gull’s Rest')).toEqual([]);
    expect(issues('LIGHTHOUSE ISLE')).toEqual([]);
  });
  it('rejects editorial, undeclared, missing and malformed placeholders',()=>{
    for (const text of ['<name>','Back in {minuts} minutes.','Back in {minutes minutes.'])
      expect(issues(text).some(issue=>issue.rule==='placeholder')).toBe(true);
    expect(()=>fillTemplate('Back in {minutes} minutes.',{})).toThrow('Missing template field');
    expect(()=>fillTemplate('{minutes}',{minutes:null})).toThrow();
    expect(fillTemplate('Back in {minutes} minutes.',{minutes:0})).toBe('Back in 0 minutes.');
    expect(issues('Back in {minutes} minutes.',{allowedFields:['minutes']})).toEqual([]);
  });
  it('extracts escaped strings and nested template labels without comments or regex contents',()=>{
    const source = '// "Ignored line"\nconst label="Wait\\u2014then"; const text=`Back ${format({label:"Captain"})} at sea.`; const re=/["\x27`]/;';
    const records = javascriptStrings(source);
    expect(records.map(record=>record.text)).toEqual(['Wait—then','Back \uFFFC at sea.','Captain']);
    expect(records[0].line).toBe(2);
  });
  it('does not lose later copy after a regex in a control statement',()=>{
    const source = 'if (ready) /[\x27`]/.test(value); const label="Mispelled word";';
    expect(javascriptStrings(source).map(record=>record.text)).toEqual(['Mispelled word']);
  });
  it('extracts HTML accessibility copy, decodes entities and omits scripts/styles/comments',()=>{
    const html = '<!-- hidden --><script>"Hidden"</script><style>.x{}</style><button aria-label="Wait&#8212;then">Captain &amp; crew</button>';
    expect(htmlStrings(html).map(record=>record.text)).toEqual(['Captain & crew','Wait—then']);
  });
  it('audits visible and accessible text inside JavaScript HTML templates',()=>{
    const source = 'element.innerHTML = `<button aria-label="Wait&#8212;then">Mispelled word</button>`;';
    const records = displayJavascriptStrings(source);
    expect(records.map(record=>record.text)).toEqual(['Mispelled word','Wait—then']);
    expect(records.flatMap(record=>issues(record.text)).some(issue=>issue.rule==='spelling')).toBe(true);
    expect(records.flatMap(record=>issues(record.text)).some(issue=>issue.rule==='dash')).toBe(true);
  });
  it('extracts JSON display fields and keeps ids and author notes out of spelling checks',()=>{
    expect(jsonStrings({about:'Technical note',id:'bad_identifier',item:{name:'Brass key',text:'A key.'}}).map(record=>record.text))
      .toEqual(['Brass key','A key.']);
  });
  it('keeps explicit named and lowercase-role identity claims out of public copy',()=>{
    expect(revealsIdentity('The culprit is Captain Example.')).toBe(true);
    expect(revealsIdentity('The culprit is the fictional clerk.')).toBe(true);
    expect(revealsIdentity('The masked captain is unknown.')).toBe(false);
    expect(revealsIdentity('Plot twist: an intentionally public intro ending.')).toBe(false);
  });
  it('covers the repository and skips secret data even when it cannot be parsed',async()=>{
    const root = await fixture(), result = await lintRepository(root);
    expect(result.diagnostics).toEqual([]);
    expect((await collect(root)).sources.some(source=>source.file.includes('/secret/'))).toBe(false);
    await mkdir(join(root,'frontend/src/secret'));
    await writeFile(join(root,'frontend/src/secret/copy.js'),"const label='The culprit is Captain Example.';");
    expect((await lintRepository(root)).diagnostics.some(issue=>issue.rule==='spoiler')).toBe(true);
  });
  it('reports protected copy but blocks the same editable typo',async()=>{
    const root = await fixture();
    await writeFile(join(root,'frontend/src/online/copy.js'),"const label='A mispelled captain.';");
    let result = await lintRepository(root);
    expect(result.diagnostics.some(issue=>issue.rule==='spelling' && issue.reportOnly)).toBe(true);
    expect(result.diagnostics.filter(issue=>!issue.reportOnly)).toEqual([]);
    await writeFile(join(root,'frontend/src/copy.js'),"const label='A mispelled captain.';");
    result = await lintRepository(root);
    expect(result.diagnostics.some(issue=>issue.rule==='spelling' && !issue.reportOnly)).toBe(true);
    expect(reportOnly('frontend/src/demo/intro-story.json')).toBe(true);
  });
  it('blocks undeclared partner fields and samples exceeding the declared length',async()=>{
    const root = await fixture(), path = join(root,'backend/content/partners.json');
    const data = JSON.parse(await readFile(path,'utf8'));
    data.events.ready.lines.any = ['Back in {minuts} minutes.'];
    await writeFile(path,JSON.stringify(data));
    expect((await lintRepository(root)).diagnostics.some(issue=>issue.rule==='placeholder')).toBe(true);
    data.events.ready.lines.any = ['Back in {minutes} minutes.']; data.max_characters = 10;
    await writeFile(path,JSON.stringify(data));
    expect((await lintRepository(root)).diagnostics.some(issue=>issue.rule==='length')).toBe(true);
  });
  it('rejects generated names that no longer fit the documented 24-character bound',async()=>{
    const root = await fixture();
    await writeFile(join(root,'backend/content/names.json'),JSON.stringify({adjectives:['Wandering'],nouns:['LighthouseLighthouse']}));
    expect((await lintRepository(root)).diagnostics.some(issue=>issue.rule==='length')).toBe(true);
  });
  it('blocks fingerprints and escaped direct identity claims even in protected files',async()=>{
    const root = await fixture(), text = 'A fictional private example sentence.';
    await writeFile(join(root,'frontend/tests/fixtures/reveal-fingerprints.json'),JSON.stringify({fingerprints:[{
      prefix:text.slice(0,10),length:text.length,sha256:createHash('sha256').update(text).digest('hex')
    }]}));
    await writeFile(join(root,'frontend/src/online/copy.js'),`const label='${text.replace('A','\\x41')}';`);
    let result = await lintRepository(root);
    expect(result.diagnostics.some(issue=>issue.rule==='spoiler' && !issue.reportOnly)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(text);
    await writeFile(join(root,'frontend/src/online/copy.js'),"const label='The culp\\x72it is Captain Example.';");
    result = await lintRepository(root);
    expect(result.diagnostics.some(issue=>issue.rule==='spoiler' && !issue.reportOnly)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Captain Example');
  });
});
