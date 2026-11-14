// Inspectable per-chunk and media transfer sizes. Run after npm run build from frontend/.
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {unshipped} from './unshipped-art.js';

const root='dist',manifest=JSON.parse(await readFile(join(root,'.vite/manifest.json'),'utf8'));
const initial=new Set(),seen=new Set();
function walk(key) {
  if(seen.has(key))return;seen.add(key);
  const chunk=manifest[key];initial.add(chunk.file);
  for(const file of chunk.css??[])initial.add(file);
  for(const dependency of chunk.imports??[])walk(dependency);
}
walk('index.html');
async function files(dir) {
  const paths=[];
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory())paths.push(...await files(path));else paths.push(path);
  }
  return paths.sort();
}
const chunks=[],images=[],audio=[],all=[];
for(const path of await files('')) {
  const data=await readFile(join(root,path)),record={file:path,bytes:data.length};all.push(record);
  if(/\.(js|css)$/.test(path))chunks.push({...record,gzipBytes:gzipSync(data).length,initial:initial.has(path)});
  if(/\.(png|webp|jpg|jpeg|svg|gif)$/i.test(path)) {
    if(path.endsWith('.png'))Object.assign(record,{width:data.readUInt32BE(16),height:data.readUInt32BE(20)});
    images.push(record);
  }
  if(/\.(mp3|ogg|wav|m4a|flac)$/i.test(path))audio.push(record);
}
const sum=records=>records.reduce((total,item)=>total+item.bytes,0);
const coldJs=chunks.filter(c=>c.initial&&c.file.endsWith('.js'));
const coldCss=chunks.filter(c=>c.initial&&c.file.endsWith('.css'));
// The title draws its scene in code (T21): it downloads no picture, and the pictures no screen shows stay out of dist.
const limits={titleJavaScript:21080,titleCss:12000,titleImage:0};
const titleImage=images.find(file=>file.file==='places/title.webp')?.bytes??null;
const leftOver=all.filter(item=>unshipped(item.file)).map(item=>item.file);
const report={limits,initial:{javaScript:sum(coldJs),javaScriptGzip:coldJs.reduce((s,c)=>s+c.gzipBytes,0),
  css:sum(coldCss),cssGzip:coldCss.reduce((s,c)=>s+c.gzipBytes,0),titleImage},
  totals:{javaScript:sum(chunks.filter(c=>c.file.endsWith('.js'))),images:sum(images),audio:sum(audio),files:all.length,bytes:sum(all)},unshippedInDist:leftOver,
  chunks,images,audio};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--check')&&(report.initial.javaScript>limits.titleJavaScript||
  report.initial.css>=limits.titleCss||titleImage!==null||leftOver.length))process.exitCode=1;
