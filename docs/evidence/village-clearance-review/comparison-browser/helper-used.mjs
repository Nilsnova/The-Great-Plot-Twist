// Native check of the exported static comparison; no game or deployment writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const repo=resolve(process.argv[2]),out=resolve(process.argv[3]);
const root=join(repo,'docs/evidence/village-clearance-review');
const {chromium}=await import(pathToFileURL(join(repo,'frontend/node_modules/playwright-core/index.mjs')).href);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const html=await readFile(join(root,'comparison.html')),manifestBytes=await readFile(join(root,'manifest.json'));
const manifest=JSON.parse(manifestBytes),paths=[...html.toString().matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(row=>row[1]);
assert.equal(paths.length,12);assert.equal(new Set(paths).size,12);
const files=new Map([['comparison.html',html]]);
for(const path of paths){const data=await readFile(join(root,path));assert.equal(hash(data),manifest.files[path].sha256);files.set(path,data);}
await mkdir(out,{recursive:false});await writeFile(join(out,'manifest-used.json'),manifestBytes);
const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
  htmlSha256:hash(html),manifestSha256:hash(manifestBytes),helperSha256:hash(await readFile(fileURLToPath(import.meta.url))),
  scope:'Static comparison page with original PNGs, not another game or persistence test.',started:new Date().toISOString(),checks:[]};
const server=createServer((request,response)=>{
  const path=decodeURIComponent(new URL(request.url,'http://localhost').pathname).slice(1);
  if(path==='favicon.ico'){response.writeHead(204);response.end();return;}
  const data=files.get(path);if(!data){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':path.endsWith('.png')?'image/png':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(data);
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
  for(const [width,height] of [[1280,720],[375,812]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
    const pageErrors=[],consoleErrors=[],externalRequests=[],responses=[],pending=[];
    page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(externalRequests.push(route.request().url()),route.abort()));
    page.on('response',response=>pending.push((async()=>{
      const path=new URL(response.url()).pathname.slice(1);if(!files.has(path))return;
      const data=await response.body();assert.equal(response.status(),200);assert.equal(hash(data),hash(files.get(path)));responses.push({path,status:200,sha256:hash(data)});
    })()));
    await page.goto(`${base}/comparison.html`,{waitUntil:'networkidle'});
    const images=page.locator('img');assert.equal(await images.count(),12);const decoded=[];
    for(const img of await images.all()){
      await img.scrollIntoViewIfNeeded();decoded.push(await img.evaluate(async node=>{await node.decode();const r=node.getBoundingClientRect();return{src:node.getAttribute('src'),width:node.naturalWidth,height:node.naturalHeight,renderedWidth:r.width};}));
    }
    assert.ok(decoded.every(row=>row.width>0&&row.height>0&&row.renderedWidth<=width));
    const layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(layout.scrollWidth<=layout.innerWidth+1);
    await page.keyboard.press('Control+Home');await page.screenshot({path:join(out,`comparison-${width}x${height}.png`)});
    await Promise.all(pending);assert.equal(new Set(responses.map(row=>row.path)).size,13);
    assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
    report.checks.push({width,height,decodedImages:decoded.length,decoded,responses,layout,pageErrors,consoleErrors,externalRequests});await context.close();
  }
  report.exitCode=0;
}catch(error){report.exitCode=1;report.error=error.message;throw error;}
finally{try{await browser?.close();}finally{await new Promise(resolve=>server.close(resolve));report.finished=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}}
console.log('PASS:12 original comparison PNGs decoded at both viewports; exact13 HTTP response hashes, no overflow/page/console/external errors.');
