// The fault runner must intercept only a selected route and never return an earned game outcome.
import {describe,it,expect,vi} from 'vitest';
import {createOnlineChaosFaults,onlineChaosFaults} from '../scripts/online-chaos-fixtures.js';

function request(path='/api/me/name/reroll',method='POST'){
  return {request:()=>({url:()=>`https://game.invalid${path}`,method:()=>method}),
    abort:vi.fn(),fulfill:vi.fn(),fallback:vi.fn()};
}
async function setup(){
  let handler;
  const page={route:vi.fn(async(pattern,value)=>{handler=value;}),unroute:vi.fn()};
  const faults=createOnlineChaosFaults(page);await faults.install();
  return {faults,page,send:route=>handler(route)};
}

describe('closed online fault fixture',()=>{
  it.each(onlineChaosFaults)('intercepts $id without generating a successful response or game data',async fault=>{
    const {faults,send}=await setup();const route=request();
    faults.set({group:'account',paths:['/api/me/name/reroll']},fault);await send(route);
    expect(route.fallback).not.toHaveBeenCalled();
    expect(faults.requests).toEqual([{group:'account',fault:fault.id,path:'/api/me/name/reroll',method:'POST'}]);
    if(fault.status===0){expect(route.abort).toHaveBeenCalledWith('failed');expect(route.fulfill).not.toHaveBeenCalled();}
    else{
      const response=route.fulfill.mock.calls[0][0];expect(response.status).toBe(fault.status);
      expect(Object.keys(response.json)).toEqual(['error']);
      expect(response.headers).toEqual(fault.status===429?{'Retry-After':'3'}:{});
    }
  });
  it('leaves other reads/routes to the closed baseline and removes only its own handler',async()=>{
    const {faults,page,send}=await setup();faults.set({group:'account',paths:['/api/me/name/reroll']},onlineChaosFaults[0]);
    for(const route of [request('/api/config','GET'),request('/api/me/name/reroll','GET'),request('/api/save','PUT')]){
      await send(route);expect(route.fallback).toHaveBeenCalledOnce();expect(route.abort).not.toHaveBeenCalled();
    }
    expect(faults.requests).toEqual([]);await faults.dispose();
    expect(page.unroute).toHaveBeenCalledWith('**/api/**',page.route.mock.calls[0][1]);
  });
});
