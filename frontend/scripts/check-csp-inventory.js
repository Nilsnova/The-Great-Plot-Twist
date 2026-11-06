// Inventory the actual built text and fail on prohibited executable/style insertions.
import assert from 'node:assert/strict';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {proposedCsp} from './csp-policy.js';
async function files(root){const result=[];for(const item of await readdir(root,{withFileTypes:true})){const path=join(root,item.name);if(item.isDirectory())result.push(...await files(path));else result.push(path);}return result;}
const allowedOrigins=new Set(['http://www.w3.org','https://creativecommons.org','https://data.binance.vision','https://github.com','https://open-meteo.com','https://uqcjihigqjgyuafrfbnp.supabase.co','wss://uqcjihigqjgyuafrfbnp.supabase.co']);
const report={checked:new Date().toISOString(),policy:proposedCsp,html:[],literalOrigins:{},libraryCapabilities:[],checks:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
  const built=await files('dist');
  for(const path of built.filter(path=>/\.(?:html|js|css|svg)$/.test(path))){
    const source=await readFile(path,'utf8'),clean=source.replace(/<!--[\s\S]*?-->/g,'');
    if(path.endsWith('.html')){
      const scripts=[...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
      const row={file:relative('dist',path),inlineScripts:scripts.filter(match=>!/\bsrc\s*=/i.test(match[1])||match[2].trim()).length,styleBlocks:(clean.match(/<style\b/gi)??[]).length,styleAttributes:(clean.match(/\sstyle\s*=/gi)??[]).length,eventAttributes:(clean.match(/\son[a-z]+\s*=/gi)??[]).length};report.html.push(row);
      check(row.inlineScripts+row.styleBlocks+row.styleAttributes+row.eventAttributes===0,`${row.file}: no inline script, style or event handler`);
    }
    check(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(source),`${path}: no dynamic code constructor`);
    if(path.endsWith('.html')||path.endsWith('.css')||path.endsWith('.svg'))check(!/(?:src\s*=\s*["'](?:data:|blob:)|url\(\s*["']?(?:data:|blob:))/i.test(source),`${path}: no embedded data/blob resource`);
    for(const origin of new Set(source.match(/(?:https?|wss):\/\/[a-zA-Z0-9._:-]+/g)??[])){
      check(allowedOrigins.has(origin),`${path}: inventoried literal origin ${origin}`);
      (report.literalOrigins[origin]??=[]).push(relative('dist',path));
    }
    const capabilities=['blob:','data:','toDataURL'].filter(value=>source.includes(value));
    if(capabilities.length)report.libraryCapabilities.push({file:relative('dist',path),capabilities});
  }
  check(report.html.length===4,'Production build contains the four documented HTML pages');
  for(const path of [...await files('src'),...await files('public')].filter(path=>/\.(?:js|html|css)$/.test(path))){
    const source=await readFile(path,'utf8');
    check(!/\.cssText\s*=|setAttribute\(\s*["']style["']\s*,|createElement\(\s*["']style["']\s*\)/.test(source),`${path}: no CSS text injection`);
    check(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(source),`${path}: no authored dynamic code constructor`);
  }
  console.log(JSON.stringify(report,null,2));
}finally{await mkdir('captures/20261106_G9-4',{recursive:true});await writeFile('captures/20261106_G9-4/inventory.json',JSON.stringify(report,null,2)+'\n');}
