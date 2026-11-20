// Reproduction setup only: genuine local actors and a normal configured-host class code.
import {createApiClients} from './api-clients.mjs';
import {loadRuntime} from './runtime.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const directory='/tmp/mp505-ship-legacy',runtime=await loadRuntime('/tmp/mp505-provider/runtime.json');
await mkdir(directory,{recursive:true,mode:0o700});
if(process.argv[2]==='actors'){
 const environment=await createApiClients({labels:['ship-class-host'],runtimePath:'/tmp/mp505-provider/runtime.json',expectedCommit:runtime.expectedCommit});
 const host=environment.clients[0];
 await writeFile(directory+'/host-player-id',host.actorId+'\n',{mode:0o600});
 await writeFile(directory+'/host-client.json',JSON.stringify({actorId:host.actorId,session:host.session})+'\n',{mode:0o600});
 const response=await fetch('http://127.0.0.1:54426/signup',{method:'POST',redirect:'error',headers:{apikey:runtime.anonKey,'Content-Type':'application/json'},body:'{}'});
 const session=await response.json();if(!response.ok||!session.access_token||session.user?.is_anonymous!==true)throw Error('Real local anonymous signup refused');
 await writeFile(directory+'/anonymous-session.json',JSON.stringify(session)+'\n',{mode:0o600});await environment.close();
 console.log('Actual local host and anonymous sessions prepared privately; start the side API next.');
}else if(process.argv[2]==='code'){
 const host=JSON.parse(await readFile(directory+'/host-client.json','utf8'));
 const response=await fetch('http://127.0.0.1:58007/api/host/demo/code',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+host.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({actionUid:randomUUID()})});
 if(response.status!==200)throw Error('Normal configured-host code generation refused:'+response.status);
 const result=await response.json();if(typeof result.code!=='string')throw Error('Normal code reply is unreadable');
 await writeFile(directory+'/class-code',result.code,{mode:0o600});console.log('Actual local class code saved privately.');
}else throw Error('Use actors before starting the side API, then code after it is ready.');
