// Measure the built title before and after checkpoint work; no live service is needed.
import {mkdir,writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
const phase=process.argv.find(value=>value.startsWith('--phase='))?.slice(8)??'after';
if(!['before','after'].includes(phase))throw new Error('Use --phase=before or --phase=after');
const env=await openWorldBrowser({preview:true});
try{
  await env.page.addInitScript(()=>{
    const observer=new MutationObserver(()=>{
      if(!document.querySelector('#play'))return;
      performance.mark('title-ready');observer.disconnect();
    });
    observer.observe(document,{childList:true,subtree:true});
  });
  await env.page.goto(env.url);
  await env.page.locator('#play').waitFor();
  await env.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const result=await env.page.evaluate(()=>({
    titleReadyMs:performance.getEntriesByName('title-ready')[0]?.startTime??null,
    firstPaintMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime??null,
  }));
  if(result.titleReadyMs===null||env.errors.length||env.external.length)throw new Error('Title did not load cleanly');
  await mkdir('captures/20261106_G9-C0',{recursive:true});
  await writeFile(`captures/20261106_G9-C0/title-${phase}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await env.close();}
