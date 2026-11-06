// Auth return values are ephemeral placeholders; these checks never contact an identity service.
import {describe,it,expect,vi} from 'vitest';
import {takeAuthReturn} from '../src/online/auth-return.js';

const placeholder=()=>`example-${Math.random().toString(36).slice(2)}`;
const historyStub=()=>({state:{game:'example'},replaceState:vi.fn()});
const address=query=>`https://game.example/play/index.html?${query}#crew`;
const cleaned=history=>new URL(history.replaceState.mock.calls[0][2]);

describe('takeAuthReturn',()=>{
  it('takes a code once and removes sensitive query fields while keeping the game address',()=>{
    const code=placeholder();
    const history=historyStub();
    const href=address(`demo=1&case=local&code=${code}&sb_flow_id=flow_example&error_description=ignored`);
    expect(takeAuthReturn({href,history})).toEqual({code,error:false,flowId:'flow_example'});
    expect(cleaned(history).pathname).toBe('/play/index.html');
    expect(cleaned(history).search).toBe('?demo=1&case=local');
    expect(cleaned(history).hash).toBe('#crew');
    expect(history.replaceState.mock.calls[0][0]).toEqual(history.state);
    expect(takeAuthReturn({href:cleaned(history).href,history})).toBeNull();
    expect(history.replaceState).toHaveBeenCalledTimes(1);
  });
  it('prefers an error over a code without returning the provider error or description',()=>{
    const description=placeholder();
    const history=historyStub();
    const href=address(`error=provider_example&code=${placeholder()}&error_description=${description}`);
    const result=takeAuthReturn({href,history});
    expect(result).toEqual({code:null,error:true,flowId:null});
    expect(JSON.stringify(result)).not.toContain(description);
    expect(JSON.stringify(result)).not.toContain('provider_example');
    expect(cleaned(history).search).toBe('');
  });
  it('recognizes an empty error parameter as an error return',()=>{
    const history=historyStub();
    expect(takeAuthReturn({href:address('error='),history})).toEqual({code:null,error:true,flowId:null});
  });
  it('does not replace an ordinary game address or a description without a return',()=>{
    const history=historyStub();
    expect(takeAuthReturn({href:address('demo=1&quality=low'),history})).toBeNull();
    expect(takeAuthReturn({href:address('error_description=example&sb_flow_id=example'),history})).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
  it('fails closed when history is blocked',()=>{
    const history={replaceState(){throw new Error('Example history restriction');}};
    expect(takeAuthReturn({href:address(`code=${placeholder()}&sb_flow_id=example`),history}))
      .toEqual({code:null,error:true,flowId:null});
  });
  it('fails closed when history has no replacement method',()=>{
    expect(takeAuthReturn({href:address(`code=${placeholder()}`),history:{}}))
      .toEqual({code:null,error:true,flowId:null});
  });
  it.each(['','%20','%0A','x'.repeat(4097)])('rejects an empty, whitespace or oversized code',code=>{
    const history=historyStub();
    expect(takeAuthReturn({href:address(`code=${code}`),history})).toEqual({code:null,error:true,flowId:null});
    expect(cleaned(history).searchParams.has('code')).toBe(false);
  });
  it.each(['a'.repeat(81),'bad%20flow','bad.flow','bad%2Fflow'])('drops an invalid flow identifier',flow=>{
    const code=placeholder();
    expect(takeAuthReturn({href:address(`code=${code}&sb_flow_id=${flow}`),history:historyStub()}))
      .toEqual({code,error:false,flowId:null});
  });
  it('keeps a conservative flow identifier up to its limit',()=>{
    const code=placeholder();
    const flowId=`Ab_-${'x'.repeat(76)}`;
    expect(takeAuthReturn({href:address(`code=${code}&sb_flow_id=${flowId}`),history:historyStub()}))
      .toEqual({code,error:false,flowId});
  });
  it('removes every duplicate sensitive field and refuses an ambiguous code',()=>{
    const history=historyStub();
    const href=address(`code=${placeholder()}&code=${placeholder()}&sb_flow_id=a&sb_flow_id=b`);
    expect(takeAuthReturn({href,history}))
      .toEqual({code:null,error:true,flowId:null});
    expect(cleaned(history).search).toBe('');
  });
  it('preserves repeated unrelated values and encoded game parameters',()=>{
    const history=historyStub();
    takeAuthReturn({href:address(`place=a%2Fb&place=c%20d&code=${placeholder()}`),history});
    expect(cleaned(history).searchParams.getAll('place')).toEqual(['a/b','c d']);
  });
  it('fails closed for malformed return URLs and ignores malformed non-return URLs',()=>{
    const history=historyStub();
    expect(takeAuthReturn({href:`not a URL?code=${placeholder()}`,history}))
      .toEqual({code:null,error:true,flowId:null});
    expect(takeAuthReturn({href:`not a URL?%63ode=${placeholder()}`,history}))
      .toEqual({code:null,error:true,flowId:null});
    expect(takeAuthReturn({href:'not a URL',history})).toBeNull();
    expect(takeAuthReturn({href:undefined,history})).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
