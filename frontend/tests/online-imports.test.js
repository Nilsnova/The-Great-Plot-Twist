// Walk the real adapter's static dependencies so rehearsal rules cannot enter its chunk graph.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {expect,it} from 'vitest';

it('keeps every real adapter dependency outside adapter/fake',async()=>{
  const seen=new Set();
  async function walk(file){
    if(seen.has(file))return;seen.add(file);
    expect(file.replaceAll('\\','/')).not.toContain('/adapter/fake/');
    const source=await readFile(file,'utf8');
    for(const [,path] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
      if(path.startsWith('.')&&path.endsWith('.js'))await walk(resolve(dirname(file),path));
    }
  }
  await walk(resolve('src/online/case-adapter/index.js'));
  expect(seen.size).toBeGreaterThan(10);
});
