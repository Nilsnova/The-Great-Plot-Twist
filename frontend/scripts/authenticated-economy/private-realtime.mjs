// Actual provider WebSocket/RLS probe. Broadcast messages carry no gameplay authority.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function checkPrivateRealtime({ownerPage,memberPage,outsiderPage,runtime,topic,accessTokens}) {
 assert.match(topic,/^live:place:isle_[a-z0-9]{5}_[a-f0-9]{24}:[1-9][0-9]?$/);
 assert.equal(accessTokens.length,3);assert.ok(accessTokens.every(token=>typeof token==='string'&&token.length>0));
 async function join(page,index){
  return page.evaluate(async({url,key,topic,token})=>{
   const {createRealtimeClient}=await import('/src/online/supabase-sdk.js');
   const client=createRealtimeClient(url,key,{accessToken:async()=>token});
   await client.realtime.setAuth(token);
   const channel=client.channel(topic,{config:{private:true,broadcast:{ack:true,self:true}}});
   const messages=[];channel.on('broadcast',{event:'acceptance'},message=>messages.push(message.payload));
   window.__acceptanceRealtime={client,channel,messages};
   return new Promise(resolve=>{
    const timeout=setTimeout(()=>resolve({status:'HARNESS_TIMEOUT'}),15000);
    channel.subscribe((status,error)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timeout);resolve({status,error:String(error?.message??'').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'<redacted>').slice(0,500)});}});
   });
  },{url:runtime.providerUrl,key:runtime.anonKey,topic,token:accessTokens[index]});
 }
 try{
  const statuses=await Promise.all([ownerPage,memberPage,outsiderPage].map(join));
  assert.equal(statuses[0].status,'SUBSCRIBED',JSON.stringify(statuses));assert.equal(statuses[1].status,'SUBSCRIBED',JSON.stringify(statuses));assert.equal(statuses[2].status,'CHANNEL_ERROR',JSON.stringify(statuses));
  const nonce=randomUUID();
  const sent=await ownerPage.evaluate(nonce=>window.__acceptanceRealtime.channel.send({type:'broadcast',event:'acceptance',payload:{nonce}}),nonce);
  assert.equal(sent,'ok');
  await memberPage.waitForFunction(nonce=>window.__acceptanceRealtime.messages.some(message=>message.nonce===nonce),nonce,{timeout:10000});
  const outsiderMessages=await outsiderPage.evaluate(()=>window.__acceptanceRealtime.messages.length);assert.equal(outsiderMessages,0);
  return {topic,statuses,broadcastAck:sent,memberReceived:true,outsiderMessages,
   boundary:'Fresh-channel membership authorization and actual delivery only; cached-channel revocation is established by canonical lifecycle checks separately.'};
 }finally{
  await Promise.all([ownerPage,memberPage,outsiderPage].map(page=>page.evaluate(async()=>{await window.__acceptanceRealtime?.client.removeAllChannels();delete window.__acceptanceRealtime;}).catch(()=>{})));
 }
}
