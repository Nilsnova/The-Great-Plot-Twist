// The public-story QA fixture stays on loopback, rejects other requests and records no credentials.
import {request} from 'node:http';
import {createConnection} from 'node:net';
import {readFile} from 'node:fs/promises';
import {afterEach,describe,expect,it} from 'vitest';
import {openIntroApiFixture} from '../scripts/intro-api-fixture.js';

const path='/api/content/intro-story';
let fixture;
afterEach(async()=>{await fixture?.close();fixture=null;});
function read(url,{method='GET',requestPath=path,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req=request(url+requestPath,{method,headers},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,
        body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.setTimeout(2000,()=>req.destroy(new Error('Fixture request timed out')));
    req.on('error',reject);req.end();
  });
}

describe('loopback public intro fixture',()=>{
  it('serves the exact unchanged canonical story bytes to anonymous GET requests',async()=>{
    fixture=await openIntroApiFixture();const response=await read(fixture.url);
    const source=await readFile(new URL('../../backend/content/story.json',import.meta.url),'utf8');
    expect(new URL(fixture.url).hostname).toBe('127.0.0.1');
    expect(Number(new URL(fixture.url).port)).toBeGreaterThan(0);
    expect(response.status).toBe(200);expect(response.body).toBe(source);
    expect(JSON.parse(response.body)).toEqual(fixture.canonical);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fixture.requests).toEqual([{method:'GET',path,authorized:false}]);
  });
  it.each(['POST','PUT','PATCH','DELETE','HEAD','OPTIONS'])('refuses %s on the story route',async method=>{
    fixture=await openIntroApiFixture();const response=await read(fixture.url,{method});
    expect(response.status).toBe(405);expect(response.headers.allow).toBe('GET');
    expect(fixture.requests).toEqual([{method,path,authorized:false}]);
  });
  it('refuses unrelated paths and records a fixed route label rather than arbitrary path values',async()=>{
    fixture=await openIntroApiFixture();const unknown=`/private-${crypto.randomUUID()}`;
    expect((await read(fixture.url,{requestPath:unknown})).status).toBe(404);
    expect(fixture.requests).toEqual([{method:'GET',path:'[other path]',authorized:false}]);
    expect(JSON.stringify(fixture.requests)).not.toContain(unknown);
  });
  it('refuses query strings without recording their names or values',async()=>{
    fixture=await openIntroApiFixture();const value=`query-${crypto.randomUUID()}`;
    expect((await read(fixture.url,{requestPath:path+'?private='+value})).status).toBe(404);
    expect(fixture.requests).toEqual([{method:'GET',path,authorized:false}]);
    expect(JSON.stringify(fixture.requests)).not.toContain(value);
    expect(JSON.stringify(fixture.requests)).not.toContain('private=');
  });
  it('refuses authorization headers and keeps only their presence',async()=>{
    fixture=await openIntroApiFixture();const value=`credential-${crypto.randomUUID()}`;
    const response=await read(fixture.url,{headers:{Authorization:value}});
    expect(response.status).toBe(401);
    expect(fixture.requests).toEqual([{method:'GET',path,authorized:true}]);
    expect(JSON.stringify(fixture.requests)).not.toContain(value);expect(response.body).not.toContain(value);
  });
  it('treats even an empty authorization header as an authenticated request',async()=>{
    fixture=await openIntroApiFixture();
    expect((await read(fixture.url,{headers:{Authorization:''}})).status).toBe(401);
    expect(fixture.requests[0].authorized).toBe(true);
  });
  it('closes owned connections and permits repeated cleanup',async()=>{
    fixture=await openIntroApiFixture();const address=new URL(fixture.url);
    const socket=createConnection({host:address.hostname,port:Number(address.port)});
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
    const closed=new Promise(resolve=>socket.once('close',resolve));
    await Promise.all([fixture.close(),fixture.close()]);await closed;
    expect(socket.destroyed).toBe(true);
    await expect(read(fixture.url)).rejects.toThrow();
  });
});
