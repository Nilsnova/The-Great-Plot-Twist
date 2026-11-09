// G29 email: the real adapter's email code answers (send, check, errors, guest upgrade) with a fake
// auth layer and recorded server replies. Messages are fixed text; no SDK text reaches a screen.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {normalizeIntentResult} from '../src/adapter/call-failure.js';

const address='captain@example.org';
const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:0,kit:null,place:null,crews:[]};
function setup(config,{guest=false,send,verify}={}){
  const session=createSession();
  const replies=new Map([['GET /api/config',{ok:true,status:200,data:config}],['GET /api/me',{ok:true,status:200,data:me}],
    ['GET /api/save',{ok:true,status:200,data:{version:1,data:{},updatedAt:null}}],['GET /api/crews/me',{ok:true,status:200,data:{crew:null}}],
    ['POST /api/me/name',{ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}}]]);
  const request=async(method,path)=>structuredClone(replies.get(`${method} ${path}`)??{ok:false,status:404,code:'not_found'});
  const api=Object.fromEntries([['get','GET'],['post','POST'],['put','PUT'],['del','DELETE']].map(([key,method])=>[key,path=>request(method,path)]));
  let state={state:'signed_out',message:'',configured:true};const listeners=new Set();
  const publish=next=>{state=next;for(const listener of listeners)listener(state);};
  if(guest){session.setToken('fixture-guest');state={state:'signed_in',message:'',configured:true,guest:true};}
  const auth={read:()=>state,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},restore:vi.fn(async()=>({ok:true})),
    signIn:vi.fn(async()=>({ok:true})),upgrade:vi.fn(async()=>({ok:true})),signOut:vi.fn(async()=>({ok:true})),dispose(){},signInAnonymously:vi.fn(),
    sendEmailCode:vi.fn(send??(async()=>({ok:true,reason:'sent'}))),
    verifyEmailCode:vi.fn(verify??(async()=>{
      session.setToken(`fixture-${Date.now()}`);publish({state:'signed_in',message:'',configured:true});
      return {ok:true,state:'signed_in',reason:guest?'confirmed':'signed_in'};}))};
  const adapter=createRealCaseAdapter({api,publicApi:api,session,auth});
  return {adapter,auth,session};
}
const config={flags:{sign_in:true},auth:{provider:'github',providers:['github','email'],supabaseUrl:''}};
const ready=async f=>vi.waitFor(()=>expect(f.adapter.read().account.providers).toEqual(['github','email']));

describe('email code sign-in through the adapter',()=>{
  it('sends a code, then signs in with it',async()=>{
    const f=setup(config);
    try{
      await ready(f);
      expect(await f.adapter.signIn({provider:'email',email:address})).toMatchObject({accepted:true,
        message:'Code sent. Check your inbox and spam folder.'});
      expect(f.auth.sendEmailCode).toHaveBeenCalledExactlyOnceWith(address,{upgrade:false});
      expect(f.adapter.read().account.state).toBe('signed_out');
      expect(await f.adapter.signIn({provider:'email',email:address,code:'123456'})).toMatchObject({accepted:true,message:'You are signed in.'});
      expect(f.auth.verifyEmailCode).toHaveBeenCalledExactlyOnceWith(address,'123456');
      await vi.waitFor(()=>expect(f.adapter.read().account).toMatchObject({state:'signed_in',guest:false}));
      expect(f.auth.signIn).not.toHaveBeenCalled();
    }finally{f.adapter.dispose();}
  });
  it('says plainly when the code is wrong, too many requests were made or email is off',async()=>{
    const cases=[
      [{verify:async()=>({ok:false,reason:'wrong_code'})},{code:'111111'},'wrong_code',/^That code is wrong or has expired\./],
      [{verify:async()=>({ok:false,reason:'no_code'})},{code:'111111'},'wrong_code',/^Send a code to this email first\./],
      [{send:async()=>({ok:false,reason:'rate_limited'})},{},'too_many_tries',/^Too many requests\. Wait a minute, then try again\.$/],
      [{verify:async()=>({ok:false,reason:'rate_limited'})},{code:'111111'},'too_many_tries',/Wait a minute/],
      [{send:async()=>({ok:false,reason:'invalid_email'})},{},'invalid_request',/^Enter your full email address\.$/],
      [{send:async()=>({ok:false,reason:'email_off'})},{},'not_ready',/^Email sign-in is not switched on yet\./],
      [{send:async()=>({ok:false,reason:'error',message:'secret-sdk-text'})},{},'not_connected',/^Email sign-in could not finish\./],
    ];
    for(const [fake,extra,reason,message] of cases){
      const f=setup(config,fake);
      try{
        await ready(f);
        const result=await f.adapter.signIn({provider:'email',email:address,...extra});
        expect(result).toMatchObject({accepted:false,reason,message:expect.stringMatching(message)});
        expect(JSON.stringify(result.message)).not.toContain('secret-sdk-text');
        // The screen boundary keeps these texts (only transport failures get generic copy).
        if(reason!=='not_connected')expect(normalizeIntentResult(result).message).toBe(result.message);
        expect(f.adapter.read().account.state).toBe('signed_out');
      }finally{f.adapter.dispose();}
    }
  });
  it('refuses email while /api/config does not list it, without asking the auth layer',async()=>{
    const f=setup({...config,auth:{provider:'github',providers:['github']}});
    try{
      await vi.waitFor(()=>expect(f.adapter.read().account.providers).toEqual(['github']));
      expect(await f.adapter.signIn({provider:'email',email:address})).toMatchObject({accepted:false,reason:'invalid_request'});
      expect(f.auth.sendEmailCode).not.toHaveBeenCalled();
    }finally{f.adapter.dispose();}
  });
  it('lets a guest confirm an email and keep the same captain',async()=>{
    const f=setup({...config,demo:{guestsByCode:true}},{guest:true});
    try{
      await ready(f);
      expect(f.adapter.read().account.guest).toBe(true);
      expect(await f.adapter.signIn({provider:'email',email:address,upgrade:true})).toMatchObject({accepted:true,
        message:expect.stringMatching(/^Code sent\. Check your inbox and spam folder\. Your progress stays with this captain\./)});
      expect(f.auth.sendEmailCode).toHaveBeenCalledExactlyOnceWith(address,{upgrade:true});
      expect(await f.adapter.signIn({provider:'email',email:address,code:'654321',upgrade:true})).toMatchObject({accepted:true,
        message:'Email confirmed. Your progress is kept.'});
      await vi.waitFor(()=>expect(f.adapter.read().account).toMatchObject({state:'signed_in',guest:false}));
      expect(f.auth.upgrade).not.toHaveBeenCalled();
    }finally{f.adapter.dispose();}
  });
  it('refuses the email upgrade for a visitor who is not a guest',async()=>{
    const f=setup(config);
    try{
      await ready(f);
      expect(await f.adapter.signIn({provider:'email',email:address,upgrade:true})).toMatchObject({accepted:false,reason:'invalid_request'});
      expect(f.auth.sendEmailCode).not.toHaveBeenCalled();
    }finally{f.adapter.dispose();}
  });
  it('tells a guest when the address already has an account',async()=>{
    const f=setup({...config,demo:{guestsByCode:true}},{guest:true,send:async()=>({ok:false,reason:'email_taken'})});
    try{
      await ready(f);
      expect(await f.adapter.signIn({provider:'email',email:address,upgrade:true})).toMatchObject({accepted:false,
        message:expect.stringMatching(/already has an account.*Guest progress is not moved\./)});
      expect(f.adapter.read().account).toMatchObject({state:'signed_in',guest:true});
    }finally{f.adapter.dispose();}
  });
});
