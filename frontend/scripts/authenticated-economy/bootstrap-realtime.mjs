// Ask the actual Realtime service to install its own tenant migrations before app policies.
import {createRealtimeClient} from '../../src/online/supabase-sdk.js';
import {loadRuntime} from './runtime.mjs';
const runtime=await loadRuntime(process.argv[2]);
const client=createRealtimeClient(runtime.providerUrl,runtime.anonKey);
const channel=client.channel('provider_bootstrap',{config:{private:true}});
try {
 await new Promise(resolve=>{
  const timer=setTimeout(resolve,10000);
  channel.subscribe(status=>{
   if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);resolve();}
  });
 });
} finally {await client.removeAllChannels();client.realtime.disconnect();}
// Initial authorization may properly refuse: schema readiness is checked independently by SQL.
process.exit(0);
