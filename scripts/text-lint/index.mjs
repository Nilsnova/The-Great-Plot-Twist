// Dependency-free repository text audit. Run with node scripts/text-lint/index.mjs.
import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect} from './extract.mjs';
import {checkText,checkPartnerTemplates,fillTemplate,wordsIn} from './rules.mjs';
import {containsFingerprint} from '../../frontend/scripts/spoiler-guard.js';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export async function lintRepository(root=repositoryRoot) {
  const policy = JSON.parse(await readFile(join(root,'scripts/text-lint/policy.json'),'utf8'));
  const dictionary = await readFile(join(root,'scripts/text-lint/words.txt'),'utf8');
  const words = new Set(dictionary.split(/\s+/).filter(Boolean));
  const {records,sources} = await collect(root), diagnostics = [];
  const partners = JSON.parse(await readFile(join(root,'backend/content/partners.json'),'utf8'));
  for (const record of records) {
    const allowedFields = record.file === 'backend/content/partners.json' && record.key?.startsWith('events.') ?
      partners.events[record.key.split('.')[1]].placeholders_used : [];
    diagnostics.push(...checkText(record,{words,policy,allowedFields}));
    if (allowedFields.length || record.file === 'backend/content/partners.json' && record.key?.includes('.lines.')) {
      try {
        if ([...fillTemplate(record.text,policy.templateSamples)].length > partners.max_characters)
          diagnostics.push({...record,rule:'length',detail:`Rendered partner sample exceeds ${partners.max_characters} characters.`});
      } catch { /* The placeholder rule reports missing values. */ }
    }
  }
  for (const issue of checkPartnerTemplates(partners)) diagnostics.push({file:'backend/content/partners.json',line:1,reportOnly:false,...issue});
  const names = JSON.parse(await readFile(join(root,'backend/content/names.json'),'utf8'));
  const longest = list=>Math.max(...list.map(word=>[...word].length));
  if (longest(names.adjectives)+longest(names.nouns)+4 > 24)
    diagnostics.push({file:'backend/content/names.json',line:1,reportOnly:false,rule:'length',detail:'Generated captain name exceeds 24 characters.'});
  const {fingerprints} = JSON.parse(await readFile(join(root,'frontend/tests/fixtures/reveal-fingerprints.json'),'utf8'));
  for (const {file,source} of sources) {
    if (fingerprints.some(fingerprint=>containsFingerprint(source,fingerprint)) || revealsIdentity(source))
      diagnostics.push({file,line:1,reportOnly:false,rule:'spoiler',detail:'Possible protected case identity/reveal association. Review privately; do not copy prose into the report.'});
  }
  return {records:records.length,files:sources.length,diagnostics};
}

export function revealsIdentity(text) {
  return /\b(?:culprit|masked captain)\s+(?:is|was|=|:)\s+(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/.test(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--vocabulary')) {
    const {records} = await collect(repositoryRoot);
    console.log([...new Set(records.flatMap(record=>wordsIn(record.text)))].sort().join('\n'));
  } else {
    const result = await lintRepository();
    if (process.argv.includes('--json')) console.log(JSON.stringify(result,null,2));
    else {
      for (const issue of result.diagnostics) console.log(`${issue.reportOnly?'REPORT':'ERROR'} ${issue.file}:${issue.line} [${issue.rule}] ${issue.detail}`);
      console.log(`Text lint: ${result.records} candidate strings in ${result.files} source files; ${result.diagnostics.filter(issue=>!issue.reportOnly).length} errors, ${result.diagnostics.filter(issue=>issue.reportOnly).length} report-only findings.`);
    }
    process.exitCode = result.diagnostics.some(issue=>!issue.reportOnly) ? 1 : 0;
  }
}
