// Extract potential display copy without executing application code. Used by the text linter.
import {readdir, readFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

export async function filesUnder(root) {
  const files = [];
  for (const entry of (await readdir(root, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (entry.name === 'secret' || entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function decodeEscape(source, index) {
  const tail = source.slice(index);
  const unicode = tail.match(/^u\{([\da-f]+)\}|^u([\da-f]{4})|^x([\da-f]{2})/i);
  if (unicode) return [String.fromCodePoint(parseInt(unicode[1] || unicode[2] || unicode[3],16)), unicode[0].length];
  return [({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','\n':'','\r':''})[source[index]] ?? source[index], 1];
}

// This lexer handles comments, escaped literals, regex literals and nested template expressions.
// It extracts chunks, not JavaScript values: an interpolation is a dynamic boundary, never prose.
export function javascriptStrings(source) {
  const records = []; let index = 0, previous = '';
  function quoted(quote) {
    const start = index++, parts = []; let text = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === '\\') {
        const [value, length] = decodeEscape(source,index); text += value; index += length;
      } else if (char === quote) break;
      else if (quote === '`' && char === '$' && source[index] === '{') {
        parts.push(text); text = ''; index++; code(true);
      } else text += char;
    }
    parts.push(text);
    records.push({text:parts.join('\uFFFC'), offset:start, dynamic:parts.length > 1,
      line:source.slice(0,start).split('\n').length, context:source.slice(Math.max(0,start-90),start)});
    previous = 'literal';
  }
  function code(nested = false) {
    let braces = 0;
    while (index < source.length) {
      const char = source[index], next = source[index+1];
      if (/\s/.test(char)) { index++; continue; }
      if (char === '/' && next === '/') { index = source.indexOf('\n',index); if (index < 0) index = source.length; continue; }
      if (char === '/' && next === '*') { const end = source.indexOf('*/',index+2); index = end < 0 ? source.length : end+2; continue; }
      if (char === '/' && (!previous || /[=(:,!&|?\[;{}]/.test(previous) || previous === 'return' || previous === '=>')) {
        index++; let bracket = false;
        while (index < source.length) {
          const value = source[index++];
          if (value === '\\') index++;
          else if (value === '[') bracket = true;
          else if (value === ']') bracket = false;
          else if (value === '/' && !bracket) break;
        }
        while (/[a-z]/i.test(source[index] || '') && index < source.length) index++;
        previous = 'regex'; continue;
      }
      if (char === '"' || char === "'" || char === '`') { quoted(char); continue; }
      if (char === '{') braces++;
      if (char === '}' && nested && braces-- === 0) { index++; return; }
      const identifier = source.slice(index).match(/^[\w$]+/);
      previous = identifier ? identifier[0] : char;
      index += identifier ? identifier[0].length : 1;
    }
  }
  code(); return records.sort((a,b)=>a.offset-b.offset);
}

export function isDisplayCandidate(record) {
  const text = record.text.trim(), context = record.context || '';
  if (!text || /^(?:https?:|\.?\.?\/|--[a-z]|\.[\w-]+$)/i.test(text)) return false;
  if (/^(?:Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right))$/.test(text)) return false;
  if (/(?:console\.(?:warn|error|log)|\.(?:closest|querySelector|querySelectorAll))\s*\(\s*$|\.(?:rel|font)\s*=\s*$/.test(context)) return false;
  if (/\b(?:uniform|varying|gl_Position|gl_FragColor)\b|void\s+main\s*\(/.test(text)) return false;
  if (/throw new (?:Error|TypeError|RangeError)\s*\(\s*$/.test(context)) return false;
  if (/^[\w./:#-]+\.(?:js|css|png|json|html|svg)\b/i.test(text)) return false;
  if (/[—–]/u.test(text) || text === '--' || /<name>|\{[a-z]+\}/i.test(text)) return true;
  const words = text.match(/[a-z]+/gi) || [];
  if (words.length > 1 && /\s/.test(text) && !/[<>]=?|=>|\b(?:const|return)\b/.test(text)) return true;
  return /^[A-Z][A-Za-z'-]*$/.test(text) ||
    /(?:label|title|text|name|speaker|body|caption|message|hint|alt)\s*:\s*$|\.textContent\s*=\s*$/.test(context);
}

const displayKeys = new Set(['title','text','name','label','message','blocked_message','description',
  'body','hint','tagline','adjectives','nouns','lines','closed_line','found_line']);
export function jsonStrings(data, source = '', path = [], displayed = false) {
  if (typeof data === 'string') return displayed ? [{text:data, key:path.join('.'),
    line:source.slice(0,Math.max(0,source.indexOf(JSON.stringify(data)))).split('\n').length}] : [];
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).flatMap(([key,value])=>jsonStrings(value,source,[...path,key],
    displayed || displayKeys.has(key)));
}

export function htmlStrings(source) {
  const records = [], clean = source.replace(/<!--[^]*?-->|<(script|style)\b[^]*?<\/\1>/gi,
    match=>match.replace(/[^\n]/g,' '));
  const decode = value=>value.replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n]);
  for (const match of clean.matchAll(/>([^<>]+)</g)) {
    if (match[1].trim()) records.push({text:decode(match[1].trim()),line:clean.slice(0,match.index).split('\n').length});
  }
  for (const match of clean.matchAll(/\b(?:aria-label|alt|placeholder|title)\s*=\s*(["'])(.*?)\1/g)) {
    records.push({text:decode(match[2]),line:clean.slice(0,match.index).split('\n').length});
  }
  return records;
}

export function reportOnly(file) {
  return /frontend\/src\/(?:online|adapter|screens|fake)\//.test(file) ||
    file === 'backend/content/story.json' || file === 'frontend/src/demo/intro-story.json' ||
    file.startsWith('backend/content/market/') || file.startsWith('backend/content/weather/');
}

export async function collect(root) {
  const paths = [...await filesUnder(join(root,'frontend/src')), ...await filesUnder(join(root,'frontend/public')),
    ...await filesUnder(join(root,'backend/content')),
    ...(await readdir(join(root,'frontend'))).filter(name=>name.endsWith('.html')).map(name=>join(root,'frontend',name))];
  const records = [], sources = [];
  for (const path of paths.filter(path=>/\.(?:js|json|html)$/.test(path)).sort()) {
    const file = relative(root,path).replaceAll('\\','/'), source = await readFile(path,'utf8');
    sources.push({file,source});
    const extracted = path.endsWith('.js') ? javascriptStrings(source).filter(isDisplayCandidate) :
      path.endsWith('.json') ? jsonStrings(JSON.parse(source),source) : htmlStrings(source);
    records.push(...extracted.map(record=>({...record,file,reportOnly:reportOnly(file)})));
  }
  return {records,sources};
}
