// Capture developer-only art/rendering fixtures from one frozen candidate; full gameplay remains separate.
// node scripts/capture-visual-matrix.mjs <runtime-frontend> <output>
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

assert.ok(process.argv[2] && process.argv[3], 'Pass the candidate frontend and output directories.');
const root = resolve(process.argv[2]), out = resolve(process.argv[3]);
const git = name => execFileSync('git',['rev-parse',name],{cwd:root,encoding:'utf8'}).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = git('HEAD'), cache = await mkdtemp(join(tmpdir(),'vis56-matrix-'));
const helpers = ['capture-visual-matrix.mjs','visual-matrix-fixture.js','visual-matrix-cases.js'];
const helperHashes = Object.fromEntries(await Promise.all(helpers.map(async name => [name,hash(await readFile(join(root,'scripts',name)))])));
const report = {source,frontendTree:git('HEAD:frontend/src'),publicTree:git('HEAD:frontend/public'),helperHashes,
  scope:'Developer-only compiled-art and wall-rendering fixtures, not actual gameplay or payment evidence.',started:new Date().toISOString(),checks:[]};
let server,browser,activePage; await mkdir(out,{recursive:true});
try {
  server = await createServer({root,configFile:false,envDir:false,cacheDir:cache,logLevel:'error',
    define:{__BUILD_STAMP__:JSON.stringify({sha:source,builtAt:report.started})},
    plugins:[{name:'vis56-owned-fixture',configureServer(vite){vite.middlewares.use('/__vis56',(_req,res)=>{
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Village visual verification fixture</title></head><body></body></html>');
    });}}],server:{host:'127.0.0.1',port:0,hmr:false}});
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true});
  for (const [width,height] of [[1280,720],[375,812]]) {
    const context = await browser.newContext({viewport:{width,height}}), page = await context.newPage(); activePage = page;
    const errors = [], external = [], consoleErrors = []; page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.route('**/*',route=>new URL(route.request().url()).origin === base ? route.continue() : (external.push(route.request().url()),route.abort()));
    await page.goto(`${base}/__vis56`,{waitUntil:'domcontentloaded'});
    for (const [type,value] of [...['cannon','mortar','harpoon','culverin','swivel','buildings'].map(kind=>['art',kind]), ...[1,2,3,4,5].map(level=>['wall',level])]) {
      const data = await page.evaluate(async ({type,value})=>{
        const fixture = await import('/scripts/visual-matrix-fixture.js');
        return type === 'art' ? fixture.renderArtMatrix(value) : fixture.renderWallMatrix(value);
      },{type,value});
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      assert.deepEqual(errors,[], 'no fixture page errors'); assert.deepEqual(external,[], 'no external resources');
      assert.deepEqual(consoleErrors,[], 'no fixture console errors');
      const file = `${type}-${value}-${width}x${height}.png`, bytes = await page.screenshot({path:join(out,file),fullPage:true});
      report.checks.push({viewport:[width,height],file,bytes:bytes.length,sha256:hash(bytes),pngSize:[bytes.readUInt32BE(16),bytes.readUInt32BE(20)],data});
      console.log(`PASS ${file}`);
    }
    await context.close(); activePage = null;
  }
  assert.equal(git('HEAD'),source,'candidate remained frozen'); report.exitCode = 0;
} catch(error) {
  report.exitCode = 1; report.error = error.message;
  if(activePage && !activePage.isClosed()) try {await activePage.screenshot({path:join(out,'failure.png'),fullPage:true});} catch {/* Keep original failure. */}
  throw error;
} finally {
  report.finished = new Date().toISOString(); await writeFile(join(out,'report.json'),`${JSON.stringify(report,null,2)}\n`);
  try {await browser?.close();} finally {try {await server?.close();} finally {await rm(cache,{recursive:true,force:true});}}
}
console.log(`PASS: ${report.checks.length} native visual fixture sheets; actual gameplay acceptance remains separate.`);
