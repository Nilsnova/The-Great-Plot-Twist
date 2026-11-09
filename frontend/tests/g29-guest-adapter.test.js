// G29 C1 and D030: the real adapter's guest start with a class code, provider list and demo_closed
// answers, with recorded replies.
import {describe,expect,it,vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {validateIntent} from '../src/online/case-adapter/validate.js';
import {mapAccount} from '../src/online/case-adapter/account-view.js';
import {mapApiResult} from '../src/online/case-adapter/reasons.js';
import {offersEmail,providerActions,signInProviders} from '../src/screens/account/providers.js';

const me={id:'private-player-placeholder',captainName:'Placeholder captain',coins:0,kit:null,place:null,crews:[]};
function setup(config,join={ok:true,status:200,data:{admitted:true}}){
  const session=createSession(),calls=[];
  const replies=new Map([['GET /api/config',{ok:true,status:200,data:config}],['GET /api/me',{ok:true,status:200,data:me}],
    ['GET /api/save',{ok:true,status:200,data:{version:1,data:{},updatedAt:null}}],['GET /api/crews/me',{ok:true,status:200,data:{crew:null}}],
    ['POST /api/me/name',{ok:true,status:200,data:{captainName:me.captainName,rerollsLeft:1}}],['POST /api/demo/join',join]]);
  const request=async(method,path,body)=>{calls.push({method,path,body});return structuredClone(replies.get(`${method} ${path}`)??{ok:false,status:404,code:'not_found'});};
  const api=Object.fromEntries([['get','GET'],['post','POST'],['put','PUT'],['del','DELETE']].map(([key,method])=>[key,(path,body)=>request(method,path,body)]));
  let state={state:'signed_out',message:'',configured:true};const listeners=new Set();
  const publish=next=>{state=next;for(const listener of listeners)listener(state);};
  const auth={read:()=>state,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},restore:vi.fn(async()=>({ok:true})),
    signIn:vi.fn(async()=>({ok:true})),upgrade:vi.fn(async()=>({ok:true})),signOut:vi.fn(async()=>({ok:true})),dispose(){},
    sendEmailCode:vi.fn(async()=>({ok:true,reason:'sent'})),verifyEmailCode:vi.fn(async()=>({ok:true,reason:'confirmed'})),
    signInAnonymously:vi.fn(async()=>{session.setToken(`fixture-${Date.now()}`);publish({state:'signed_in',message:'',configured:true,guest:true});return {ok:true,state:'signed_in'};})};
  const adapter=createRealCaseAdapter({api,publicApi:api,session,auth});
  return {adapter,auth,session,calls};
}
const base={flags:{sign_in:true},auth:{provider:'github',supabaseUrl:''}};

describe('guest sign-in through the adapter',()=>{
  it('signs a visitor in as a guest and presents the class code before reading the player',async()=>{
    const f=setup({...base,demo:{guestsByCode:true}});
    try{
      const result=await f.adapter.signIn({guest:true,code:'HARBOR-K7QXM'});
      expect(result).toMatchObject({accepted:true});
      expect(f.auth.signInAnonymously).toHaveBeenCalledOnce();expect(f.auth.signIn).not.toHaveBeenCalled();
      const joins=f.calls.filter(call=>call.path==='/api/demo/join');
      expect(joins).toHaveLength(1);expect(joins[0].body.code).toBe('HARBOR-K7QXM');
      expect(joins[0].body.actionUid).toMatch(/^[0-9a-f-]{36}$/);
      // The join comes before any gated read: /api/me only after the admission.
      const order=f.calls.map(call=>call.path);
      expect(order.indexOf('/api/demo/join')).toBeLessThan(order.lastIndexOf('/api/me'));
      await vi.waitFor(()=>expect(f.adapter.read().account).toMatchObject({state:'signed_in',guest:true}));
    }finally{f.adapter.dispose();}
  });
  it('refuses a wrong or old code with a plain message and lets the player type it again',async()=>{
    const f=setup({...base,demo:{guestsByCode:true}},{ok:false,status:403,code:'class_code_invalid',message:'This class code is not valid.'});
    try{
      const first=await f.adapter.signIn({guest:true,code:'ZZ234'});
      expect(first).toMatchObject({accepted:false,reason:'class_code_invalid',message:'This class code is not valid. Ask the presenter for the current code.'});
      const second=await f.adapter.signIn({guest:true,code:'ZZ235'});
      expect(second).toMatchObject({accepted:false,reason:'class_code_invalid'});
      // One anonymous sign-in: the retry reuses the guest session and only presents the code again.
      expect(f.auth.signInAnonymously).toHaveBeenCalledOnce();
      expect(f.calls.filter(call=>call.path==='/api/demo/join').map(call=>call.body.code)).toEqual(['ZZ234','ZZ235']);
      expect(f.calls.some(call=>call.path==='/api/me'&&f.calls.indexOf(call)>f.calls.findIndex(c=>c.path==='/api/demo/join'))).toBe(false);
    }finally{f.adapter.dispose();}
  });
  it('passes on the wait of a 429 and maps a 403 demo_closed',async()=>{
    const f=setup({...base,demo:{guestsByCode:true}},{ok:false,status:429,code:'too_many_requests',message:'Too many tries with a class code.'});
    try{
      expect(await f.adapter.signIn({guest:true,code:'K7QXM'})).toMatchObject({accepted:false,reason:'rate_limited',message:'Too many tries with a class code.'});
    }finally{f.adapter.dispose();}
    const g=setup({...base,demo:{guestsByCode:true}},{ok:false,status:403,code:'demo_closed',message:'x'});
    try{expect(await g.adapter.signIn({guest:true,code:'K7QXM'})).toMatchObject({accepted:false,reason:'demo_closed'});}finally{g.adapter.dispose();}
  });
  it('never starts a guest without a code, and keeps local play while guests are off',async()=>{
    const f=setup({...base,demo:{guestsByCode:true}});
    try{
      expect(await f.adapter.signIn({guest:true})).toMatchObject({accepted:false,reason:'class_code_needed'});
      expect(f.auth.signInAnonymously).not.toHaveBeenCalled();
    }finally{f.adapter.dispose();}
    for(const config of [{...base,demo:{guestsByCode:false}},base,{...base,demo:{open:true}}]){
      const g=setup(config);
      try{
        expect(await g.adapter.signIn({guest:true,code:'K7QXM'})).toMatchObject({accepted:false,reason:'demo_closed'});
        expect(g.auth.signInAnonymously).not.toHaveBeenCalled();expect(g.auth.signIn).not.toHaveBeenCalled();
        expect(g.calls.some(call=>call.path==='/api/demo/join')).toBe(false);
        expect(g.adapter.read().account.state).toBe('signed_out');
      }finally{g.adapter.dispose();}
    }
  });
  it('offers each configured provider and refuses one that is not listed',async()=>{
    const f=setup({...base,auth:{provider:'github',providers:['github','email','google']}});
    try{
      await vi.waitFor(()=>expect(f.adapter.read().account.providers).toEqual(['github','email']));
      expect(await f.adapter.signIn({provider:'github'})).toMatchObject({accepted:true});
      expect(f.auth.signIn).toHaveBeenCalledWith('github');
      // Google was dropped: the intent shape refuses it before any transport.
      expect(await f.adapter.signIn({provider:'google'})).toMatchObject({accepted:false,reason:'invalid_request'});
      expect(f.auth.signIn).toHaveBeenCalledOnce();
    }finally{f.adapter.dispose();}
    const g=setup(base);
    try{
      await vi.waitFor(()=>expect(g.adapter.read().account.providers).toEqual(['github']));
      expect(await g.adapter.signIn({provider:'email',email:'captain@example.org'})).toMatchObject({accepted:false,reason:'invalid_request'});
      expect(await g.adapter.signIn()).toMatchObject({accepted:true});expect(g.auth.signIn).toHaveBeenCalledWith('github');
    }finally{g.adapter.dispose();}
  });
  it('upgrades only a guest, through the auth upgrade',async()=>{
    const f=setup({...base,demo:{guestsByCode:true},auth:{providers:['github','email']}});
    try{
      expect(await f.adapter.signIn({upgrade:true})).toMatchObject({accepted:false,reason:'invalid_request'});
      await f.adapter.signIn({guest:true,code:'K7QXM'});
      expect(await f.adapter.signIn({provider:'github',upgrade:true})).toMatchObject({accepted:true});
      expect(f.auth.upgrade).toHaveBeenCalledWith('github');
      // A guest who joined by class code can also keep their progress with an email code.
      await vi.waitFor(()=>expect(f.adapter.read().account.providers).toEqual(['github','email']));
      expect(await f.adapter.signIn({provider:'email',email:'captain@example.org',upgrade:true})).toMatchObject({accepted:true});
      expect(f.auth.sendEmailCode).toHaveBeenCalledExactlyOnceWith('captain@example.org',{upgrade:true});
    }finally{f.adapter.dispose();}
  });
});

describe('guest shapes and answers',()=>{
  it('validates sign-in options before any transport',()=>{
    for(const ok of [undefined,{},{provider:'github'},{guest:true},{guest:true,code:'HARBOR-K7QXM'},{guest:true,code:'k7q xm'},{provider:'github',upgrade:true},
      {provider:'email',email:'captain@example.org'},{provider:'email',email:'captain@example.org',code:'012345'},
      {provider:'email',email:'captain@example.org',upgrade:true}])expect(validateIntent('signIn',[ok])).toBeNull();
    for(const bad of [null,'github',[],{provider:'myspace'},{provider:'google'},{guest:false},{guest:true,provider:'github'},{guest:true,upgrade:true},{extra:1},
      {code:'K7QXM'},{guest:true,code:7},{guest:true,code:''},{guest:true,code:'<img>'},{guest:true,code:'K'.repeat(33)},{provider:'github',code:'K7QXM'},
      {provider:'email'},{provider:'email',email:42},{provider:'email',email:`${'a'.repeat(250)}@x.io`},{email:'captain@example.org'},
      {provider:'github',email:'captain@example.org'},{provider:'email',email:'captain@example.org',code:'12345'},
      {provider:'email',email:'captain@example.org',code:'K7QXM'},
      {provider:'email',email:'captain@example.org',code:123456},{provider:'github',code:'123456'},{guest:true,provider:'email',email:'a@b.co'}])
      expect(validateIntent('signIn',[bad])).toMatchObject({accepted:false,reason:'invalid_request'});
  });
  it('shows a plain message for 403 demo_closed and keeps other 403s as forbidden',()=>{
    expect(mapApiResult({ok:false,status:403,code:'demo_closed'},{route:'/api/me'})).toMatchObject({accepted:false,reason:'demo_closed',
      message:expect.stringMatching(/^Guest play needs the class code from the presenter\./)});
    expect(mapApiResult({ok:false,status:403,code:'not_host'},{route:'/api/me'})).toMatchObject({reason:'forbidden'});
  });
  it('maps guest and provider facts into the account view',()=>{
    expect(mapAccount({accountState:'signed_in',auth:{guest:true,configured:true},config:{auth:{providers:['email','google','github','email','x']}}}))
      .toMatchObject({guest:true,providers:['email','github']});
    expect(mapAccount({accountState:'signed_out',config:{auth:{providers:['google']}}})).toMatchObject({providers:['github']});
    expect(mapAccount({accountState:'signed_out',auth:{guest:true}})).toMatchObject({guest:false,providers:['github']});
  });
  it('turns providers into plain sign-in and upgrade buttons',()=>{
    expect(signInProviders({})).toEqual(['github']);
    expect(signInProviders({providers:['google']})).toEqual(['github']);
    // Email is the code form, not a button; email alone leaves no OAuth button and no GitHub fallback.
    expect(signInProviders({providers:['email']})).toEqual([]);
    expect(offersEmail({providers:['github','email']})).toBe(true);expect(offersEmail({providers:['github','google']})).toBe(false);
    expect(providerActions({providers:['github','email','google']}).map(item=>[item.label,item.args,item.focus])).toEqual([
      ['Sign in with GitHub',[],'account-sign-in']]);
    expect(providerActions({providers:['email','github']},{prefix:'Keep progress with',upgrade:true,focus:'up'}).map(item=>[item.label,item.args]))
      .toEqual([['Keep progress with GitHub',[{provider:'github',upgrade:true}]]]);
  });
});
