// An owned loopback HTTP fixture serves only the unchanged approved public S1 story for browser QA.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const STORY_PATH='/api/content/intro-story';
const REFUSAL=JSON.stringify({error:{code:'fixture_request_refused',message:'This fixture serves only the public intro.'}});
function safePath(input){
  try{return new URL(input,'http://127.0.0.1').pathname===STORY_PATH?STORY_PATH:'[other path]';}
  catch{return '[other path]';}
}

export async function openIntroApiFixture(){
  const payload=await readFile(new URL('../../backend/content/story.json',import.meta.url));
  const canonical=JSON.parse(payload.toString('utf8'));
  const requests=[];
  const server=createServer((request,response)=>{
    const authorized=Object.hasOwn(request.headers,'authorization');
    requests.push({method:request.method,path:safePath(request.url),authorized});
    let status=200;
    if(authorized)status=401;
    else if(request.method!=='GET')status=405;
    else if(request.url!==STORY_PATH)status=404;
    const body=status===200?payload:REFUSAL;
    response.writeHead(status,{
      'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'Content-Length':Buffer.byteLength(body),...(status===405?{Allow:'GET'}:{}),
    });
    response.end(body);
  });
  server.requestTimeout=5000;
  server.headersTimeout=5000;
  server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({host:'127.0.0.1',port:0},()=>{server.off('error',reject);resolve();});
  });
  const url=`http://127.0.0.1:${server.address().port}`;
  let closing=null;
  function close(){
    if(!closing)closing=new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
      server.closeAllConnections();
    });
    return closing;
  }
  return {url,canonical,requests,close};
}
