// Inspectable per-chunk and media transfer sizes. Run after npm run build from frontend/.
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';

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
const chunks=[],images=[],audio=[];
for(const path of await files('')) {
  const data=await readFile(join(root,path)),record={file:path,bytes:data.length};
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
const limits={titleJavaScript:35000,titleCss:12000,titleImage:40000};
const titleImage=images.find(file=>file.file==='places/title.png')?.bytes??null;
const report={limits,initial:{javaScript:sum(coldJs),javaScriptGzip:coldJs.reduce((s,c)=>s+c.gzipBytes,0),
  css:sum(coldCss),cssGzip:coldCss.reduce((s,c)=>s+c.gzipBytes,0),titleImage},
  totals:{javaScript:sum(chunks.filter(c=>c.file.endsWith('.js'))),images:sum(images),audio:sum(audio)},
  chunks,images,audio};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--check')&&(report.initial.javaScript>=limits.titleJavaScript||
  report.initial.css>=limits.titleCss||titleImage===null||titleImage>=limits.titleImage))process.exitCode=1;
