// Local QA reads use Node HTTP directly; the game continues to use browser fetch.
import {get as httpGet} from 'node:http';
import {get as httpsGet} from 'node:https';
export function readHttp(input){
  const url=new URL(input),get=url.protocol==='https:'?httpsGet:httpGet;
  return new Promise((resolve,reject)=>{
    const request=get(url,response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
      response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8'),status=response.statusCode;
        resolve({status,ok:status>=200&&status<300,headers:new Headers(response.headers),text:async()=>text,json:async()=>JSON.parse(text)});
      });
    });
    request.setTimeout(5000,()=>request.destroy(new Error('QA HTTP read timed out')));request.on('error',reject);
  });
}
