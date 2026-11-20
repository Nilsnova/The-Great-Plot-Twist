// Only initial real-user/shared-island setup; writes credentials exclusively to a private external file.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createApiClients} from './api-clients.mjs';
import {install,admit,observe} from './observer.mjs';
const directory=resolve(process.argv[2]);await mkdir(directory,{recursive:true,mode:0o700});
const env=await createApiClients({labels:['visible-wager-owner','visible-wager-member']});
const [owner,member]=env.clients,uid=()=>randomUUID().replaceAll('-','');
const checked=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
try{
 checked(await owner.request('/api/games',{method:'POST',body:{actionUid:uid()}}));
 const initial=checked(await owner.request('/api/island'));
 await install('update public.islands set wave_best=4,next_wave=5 where player_id=$1::uuid returning wave_best',[owner.actorId],
  'Initial saved Harbor eligibility before admission; no earned victory/history is fabricated');
 await admit(owner.actorId,{coins:200});
 checked(await member.request('/api/games/join',{method:'POST',body:{code:initial.code,actionUid:uid()}}));
 const view=checked(await owner.request('/api/island'));assert.equal(view.economy.treasury.availableCoins,'200');
 const wallets=await observe('select player_id,balance::text from public.wallets where player_id=any($1::uuid[]) order by player_id',[[owner.actorId,member.actorId]]);
 const data={productionCandidate:env.runtime.expectedCommit,preparedAt:new Date().toISOString(),code:initial.code,economy:view.economy,wallets,
  prepareSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  clients:env.clients.map(({label,actorId,email,password,session})=>({label,actorId,email,password,session}))};
 const file=join(directory,'private-clients.json');await writeFile(file,JSON.stringify(data)+'\n',{mode:0o600});
 console.log('Prepared real owner/member and fresh200 treasury; private credentials excluded from output');
}finally{await env.close();}
