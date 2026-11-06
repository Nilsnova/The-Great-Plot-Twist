// Issue drafts must contain only safe diagnostics, never app/player objects.
import {describe,it,expect} from 'vitest';
import {createProblemUrl,sanitizeProblemReport} from '../src/diagnostics/report-url.js';
import {createUiTrace} from '../src/diagnostics/trace.js';
const sample={build:{sha:'abcdef0',builtAt:'2026-11-06T16:00:00.000Z'},placeId:'lighthouse_isle',viewport:{width:1280,height:800},inputType:'mouse',actions:['settings_open','credits_open']};
describe('problem reports',()=>{
  it('keeps only allowlisted fields and values',()=>{
    const report=sanitizeProblemReport({...sample,playerName:'DO_NOT_SEND_NAME',playerId:'DO_NOT_SEND_ID',token:'DO_NOT_SEND_TOKEN',save:{text:'DO_NOT_SEND_SAVE'},caseState:{secret:'DO_NOT_SEND_CASE'},build:{...sample.build,token:'DO_NOT_SEND_NESTED'},viewport:{...sample.viewport,extra:'DO_NOT_SEND_DIMENSION'},actions:['settings_open','DO_NOT_SEND_ACTION','credits_open']});
    expect(report).toEqual(sample);
    expect(JSON.stringify(report)).not.toContain('DO_NOT_SEND');
  });
  it('rejects unrecognised places, inputs, dimensions and build values',()=>{
    expect(sanitizeProblemReport({build:{sha:'player name',builtAt:'secret'},placeId:'Captain private',inputType:'device identifier',viewport:{width:Infinity,height:'token'},actions:['not_allowed']})).toEqual({build:{sha:'dev',builtAt:null},placeId:null,viewport:null,inputType:null,actions:[]});
  });
  it('encodes a fixed issue destination, leaves the description empty, and stays bounded',()=>{
    const url=new URL(createProblemUrl({...sample,title:'DO_NOT_SEND_TITLE',body:'DO_NOT_SEND_BODY',actions:Array(10000).fill('DO_NOT_SEND_ACTION')}));
    expect(url.origin+url.pathname).toBe('https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new');
    expect(url.searchParams.get('title')).toContain('abcdef0');
    expect(url.searchParams.get('body')).toContain('1280 × 800');
    expect(url.searchParams.get('body').endsWith('## What happened?\n\n')).toBe(true);
    expect(url.href).not.toContain('DO_NOT_SEND');expect(url.href.length).toBeLessThan(7000);
  });
  it('retains only the last ten allowed UI action names and returns copies',()=>{
    const trace=createUiTrace();for(let i=0;i<15;i++)trace.record(i%2?'settings_open':'resume');
    trace.record('private arbitrary text');const actions=trace.read();expect(actions).toHaveLength(10);actions.push('mutation');expect(trace.read()).toHaveLength(10);
    trace.clear();expect(trace.read()).toEqual([]);
  });
});
