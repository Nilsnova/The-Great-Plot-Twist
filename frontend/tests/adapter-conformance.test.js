// The memory adapter and fixture boundary satisfy the same public presentation contract.
import {describe,it,expect} from 'vitest';
import {createFakeAdapter} from '../src/adapter/fake/index.js';
import {defineAdapterConformance} from '../src/adapter/conformance/suite.js';
import {createFixtureRequest,routeFixtures} from '../src/adapter/conformance/fixtures.js';

const driver={
  probes:{deleteMyData:[{confirm:false}],setEmote:['wave'],reportPosition:[{place:'saltreach_harbor',x:1,y:1,facing:'front',moving:true}]},
  sequence:[{method:'signIn',repeat:true}],
  assertProgress:view=>expect(view.account.state).toBe('signing_in'),
};

defineAdapterConformance('memory fake',()=>createFakeAdapter(),driver);

describe('offline route fixture harness',()=>{
  it('returns queued recorded JSON replies and records requests without network',async()=>{
    const request=createFixtureRequest(routeFixtures());
    const route=[['GET','/api/me'],['POST','/api/me/name/reroll'],['GET','/api/islet']];
    for(const [method,path] of route){
      const response=await request(path,{method});
      expect(response).toBeInstanceOf(Response);
      await response.json();
    }
    expect(request.calls.map(call=>`${call.method} ${call.path}`)).toEqual([
      'GET /api/me','POST /api/me/name/reroll','GET /api/islet',
    ]);
    expect(request.remaining()).toBe(0);
    await expect(request('/api/unexpected')).rejects.toThrow(/fixture mismatch/);
  });

  it('redacts credentials, cookies and sensitive JSON fields from call records',async()=>{
    const request=createFixtureRequest([{method:'POST',path:'/api/check',status:200,body:{ok:true}}]);
    await request('/api/check',{method:'POST',headers:{Authorization:'Bearer secret',Cookie:'sid=secret','x-api-key':'key-secret'},body:JSON.stringify({accessToken:'token-secret',codeVerifier:'verifier-secret',nested:{apiKey:'nested-key'},label:'visible'})});
    const recorded=JSON.stringify(request.calls);
    for(const secret of ['secret','key-secret','token-secret','verifier-secret','nested-key'])expect(recorded).not.toContain(secret);
    expect(recorded).toContain('visible');
  });
});
