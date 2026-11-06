// Pure copy rules and template validation. Used by the CLI and mutation tests.
const normalize = text=>text.normalize('NFC').replaceAll('’',"'");
export const wordsIn = text=>(normalize(text).replace(/\{[a-z_]+\}/gi,' ').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).map(word=>word.toLowerCase());
const escaped = text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function fillTemplate(text, values) {
  const rendered = text.replace(/\{([a-z_]+)\}/gi,(_,name)=>{
    if (!Object.hasOwn(values,name) || values[name] === undefined || values[name] === null) throw new Error(`Missing template field: ${name}`);
    return String(values[name]);
  });
  if (/[{}]/.test(rendered)) throw new Error('Unresolved template field');
  return rendered;
}

function oneEdit(left,right) {
  if (left === right || Math.abs(left.length-right.length)>1) return false;
  for (let i=0;i<Math.max(left.length,right.length);i++) {
    if (left[i] === right[i]) continue;
    return left.slice(i+1) === right.slice(i+1) || left.slice(i) === right.slice(i+1) || left.slice(i+1) === right.slice(i);
  }
  return false;
}

export function checkText(record, {words,policy,allowedFields=[]}) {
  const text = normalize(record.text), issues = [], add=(rule,detail)=>issues.push({...record,rule,detail});
  if (/[—–]|--/.test(text)) add('dash','Use words, a comma, or a single hyphen instead of a long/double dash.');
  if (/<name>|\b(?:TODO|TBD|FIXME)\b/i.test(text)) add('placeholder','Unfilled editorial placeholder.');
  if (/[{}]/.test(text)) {
    const fields = [...text.matchAll(/\{([a-z_]+)\}/gi)].map(match=>match[1]);
    if (fields.some(field=>!allowedFields.includes(field))) add('placeholder','Template field is not declared for this display text.');
    try { fillTemplate(text,Object.fromEntries(allowedFields.map(field=>[field,policy.templateSamples[field]]))); }
    catch { add('placeholder','Template cannot be fully rendered with its declared sample values.'); }
  }
  for (const word of new Set(wordsIn(text))) {
    if (policy.spellings[word]) add('dialect',`Use ${policy.spellings[word]} (${policy.dialect}).`);
    if (!words.has(word)) add('spelling',`Unreviewed word: ${word}. Check spelling before adding to words.txt.`);
  }
  for (const name of policy.names) {
    const pattern = new RegExp(`\\b${escaped(name)}\\b`,'gi');
    for (const match of text.matchAll(pattern)) {
      if (match[0] !== name && match[0] !== name.toUpperCase()) add('name',`Use canonical capitalization: ${name}.`);
    }
    const nameWords = name.toLowerCase().split(' ');
    if (nameWords.length < 2) continue;
    const tokens = text.toLowerCase().split(/[^a-z']+/);
    for (let i=0;i<=tokens.length-nameWords.length;i++) {
      const window = tokens.slice(i,i+nameWords.length);
      const differences = window.map((token,j)=>token === nameWords[j] ? 0 : oneEdit(token,nameWords[j]) ? 1 : 2);
      if (differences.reduce((sum,n)=>sum+n,0) === 1) add('name',`Possible misspelling of canonical name: ${name}.`);
    }
  }
  return issues;
}

export function checkPartnerTemplates(data) {
  const issues = [];
  for (const [eventName,event] of Object.entries(data.events)) {
    for (const [variant,lines] of Object.entries(event.lines)) {
      lines.forEach((text,index)=>{
        const key = `events.${eventName}.lines.${variant}.${index}`, fields = event.placeholders_used;
        const used = [...text.matchAll(/\{([^}]+)\}/g)].map(match=>match[1]);
        if (used.some(field=>!fields.includes(field) || !Object.hasOwn(data.placeholders,field))) issues.push({key,rule:'placeholder',detail:'Partner field missing from event/global declarations.'});
      });
    }
  }
  return issues;
}
