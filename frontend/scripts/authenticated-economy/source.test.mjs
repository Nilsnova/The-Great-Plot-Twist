// Real temporary Git history checks for source qualification; no provider/network operations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceEvidence} from './source.mjs';
test('tracked test-only commits retain evidence; real or untracked production edits refuse it',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mp-economy-source-'));
 const git=(...args)=>execFileSync('git',['-c','user.name=Ianno Hollensteiner','-c','user.email=347053454+Iannomh123456@users.noreply.github.com',...args],{cwd:directory,encoding:'utf8',stdio:'pipe'});
 try{
  git('init','--quiet');await mkdir(join(directory,'backend/server/tests'),{recursive:true});
  await writeFile(join(directory,'backend/server/app.py'),'VALUE = 1\n');
  await writeFile(join(directory,'backend/server/tests/test_old.py'),'def test_old(): pass\n');
  git('add','.');git('commit','--quiet','-m','Create disposable production baseline');const baseline=git('rev-parse','HEAD').trim();
  await writeFile(join(directory,'backend/server/tests/test_old.py'),'def test_changed(): pass\n');
  await writeFile(join(directory,'backend/server/tests/test_new.py'),'def test_new(): pass\n');
  git('add','.');git('commit','--quiet','-m','Add test-only coverage');
  const evidence=sourceEvidence(baseline,{checkoutRoot:directory});assert.equal(evidence.productionDiffFromBaseline,'empty');assert.notEqual(evidence.actualCheckoutHead,baseline);
  await writeFile(join(directory,'backend/server/app.py'),'VALUE = 2\n');assert.throws(()=>sourceEvidence(baseline,{checkoutRoot:directory}),/Production source differs/);
  await writeFile(join(directory,'backend/server/app.py'),'VALUE = 1\n');
  await writeFile(join(directory,'backend/server/new_production.py'),'VALUE = 1\n');assert.throws(()=>sourceEvidence(baseline,{checkoutRoot:directory}),/Untracked production/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
