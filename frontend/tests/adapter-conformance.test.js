import {describe,it,expect} from 'vitest';
import {createFakeCaseAdapter} from '../src/adapter/fake/index.js';
import {defineAdapterConformance} from '../src/adapter/conformance/suite.js';
import {createFixtureRequest,caseFixtures} from '../src/adapter/conformance/fixtures.js';

const driver={
  prepare:async adapter=>{
    await adapter.completeIntro({ending:'ending_rescue',actions:[]});
    await adapter.createCrew();await adapter.muster();
    adapter.dev.give('C1',1);adapter.dev.give('C2',2);
    adapter.dev.pinForSeat('C2',2);
  },
  probes:{deleteMyData:[{confirm:false}],resolveSaveConflict:['keep_this_device'],setEmote:['wave'],reportPosition:[{place:'saltreach_harbor',x:1,y:1,facing:'front',moving:true}]},
  sequence:[{method:'pin',args:['C1'],repeat:true},{method:'pair',args:['C1','C2'],repeat:true}],
  assertProgress:view=>expect(view.board.deductions.some(item=>item.id==='D1'&&item.complete)).toBe(true),
};

defineAdapterConformance('memory fake',()=>createFakeCaseAdapter(),driver);

describe('offline route fixture harness',()=>{
  it('returns queued recorded JSON replies and records requests without network',async()=>{
    const request=createFixtureRequest(caseFixtures());
    const route=[['GET','/api/me'],['POST','/api/intro/complete'],['POST','/api/crews'],['GET','/api/board'],['PUT','/api/save']];
    for(const [method,path] of route){
      const response=await request(path,{method});
      expect(response).toBeInstanceOf(Response);
      await response.json();
    }
    expect(request.calls.map(call=>`${call.method} ${call.path}`)).toEqual([
      'GET /api/me','POST /api/intro/complete','POST /api/crews','GET /api/board','PUT /api/save',
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
