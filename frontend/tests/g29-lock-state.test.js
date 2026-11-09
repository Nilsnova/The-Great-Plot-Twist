// G29 C3: the Keeper's Lock screen's state machine, its plain messages and the browser-only place.
import {describe,expect,it} from 'vitest';
import {LOCK_PLACE_KEY,initialLock,isPlace,lockActions,lockFailure,lockStep,placeLabel,readChosenPlace,sourceLine,writeChosenPlace} from '../src/class-demo/lock-state.js';

const choices=[{id:'clear',label:'Sunny or clear'},{id:'cloudy',label:'Cloudy'},{id:'rain',label:'Rain'},{id:'fog',label:'Fog or mist'}];
const view=(extra={})=>({question:'What does the sky over Lisbon look like right now?',place:{name:'Lisbon',source:'ip'},weatherSource:'live',choices,opened:false,hintReady:false,...extra});
const ready=()=>lockStep(lockStep(initialLock(),{type:'load'}),{type:'loaded',view:view()});
function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),data};}

describe('lock state',()=>{
  it('shows the question and the sky choices once loaded',()=>{
    const state=ready();
    expect(state.status).toBe('ready');expect(lockActions(state)).toMatchObject({choices,hint:false,confirm:null,changePlace:true});
  });
  it('opens on an accepted answer and keeps the server message',()=>{
    let state=lockStep(ready(),{type:'answer',answer:'rain',uid:'lock0001'});
    expect(state).toMatchObject({status:'sending',pending:'rain',uid:'lock0001'});expect(lockActions(state).choices).toEqual([]);
    state=lockStep(state,{type:'answered',reply:{accepted:true,match:'close',message:'Close enough: the reading says Cloudy.',lock:view({opened:true})}});
    expect(state).toMatchObject({status:'open',opened:true,match:'close',tone:'success',message:'Close enough: the reading says Cloudy.'});
    expect(lockStep(state,{type:'answer',answer:'clear',uid:'x'})).toBe(state);
  });
  it('walks the hint path after one wrong answer',()=>{
    let state=lockStep(lockStep(ready(),{type:'answer',answer:'fog',uid:'u1'}),{type:'answered',reply:{accepted:false,reason:'wrong',message:'Not quite.',lock:view({hintReady:true})}});
    expect(lockActions(state)).toMatchObject({hint:true,confirm:null});
    state=lockStep(lockStep(state,{type:'answer',answer:'hint',uid:'u2'}),{type:'answered',reply:{accepted:false,reason:'hint_offered',prompt:'I looked outside',message:'Look once more.',lock:view({hintReady:true})}});
    expect(lockActions(state)).toMatchObject({hint:false,confirm:'I looked outside'});
    state=lockStep(lockStep(state,{type:'answer',answer:'hint_confirm',uid:'u3'}),{type:'answered',reply:{accepted:true,match:'hint',message:'The lock trusts you.',lock:view({opened:true})}});
    expect(state).toMatchObject({opened:true,match:'hint'});
  });
  it('treats a changed question as information, not a wrong try',()=>{
    const state=lockStep(lockStep(ready(),{type:'answer',answer:'fog',uid:'u1'}),{type:'answered',reply:{accepted:false,reason:'question_changed',message:'The weather changed.',lock:view({weatherSource:'clue'})}});
    expect(state.tone).toBe('info');expect(lockActions(state).changePlace).toBe(false);
  });
  it('repeats the same answer with the same id after an unknown outcome',()=>{
    let state=lockStep(lockStep(ready(),{type:'answer',answer:'rain',uid:'first'}),{type:'answer_failed',failure:{status:0,code:'network_error'}});
    expect(state).toMatchObject({status:'error',uid:'first',pending:'rain',fatal:false});
    expect(lockStep(state,{type:'answer',answer:'rain',uid:'second'}).uid).toBe('first');
    expect(lockStep(state,{type:'answer',answer:'fog',uid:'second'}).uid).toBe('second');
    state=lockStep(lockStep(ready(),{type:'answer',answer:'rain',uid:'first'}),{type:'answer_failed',failure:{status:422,code:'validation_error'}});
    expect(state.uid).toBeNull();
  });
  it('says demo_closed, too_many_tries and 429 plainly',()=>{
    expect(lockFailure({status:403,code:'demo_closed'})).toMatchObject({fatal:true,message:expect.stringMatching(/demo is closed/)});
    expect(lockFailure({status:409,code:'too_many_tries'})).toMatchObject({fatal:true,message:expect.stringMatching(/enough answers/)});
    expect(lockFailure({status:429,code:'too_many_requests',retryAfterSeconds:7})).toMatchObject({fatal:false,retryAfter:7,message:'Too many tries at once. Wait 7 seconds, then try again.'});
    expect(lockFailure({status:429})).toMatchObject({message:'Too many tries at once. Wait a moment, then try again.'});
    expect(lockFailure({status:0}).message).toMatch(/No connection/);
    expect(lockFailure({status:503,code:'lock_unavailable'}).message).toMatch(/stuck/);
    const closed=lockStep(lockStep(initialLock(),{type:'load'}),{type:'load_failed',failure:{status:403,code:'demo_closed'}});
    expect(closed).toMatchObject({status:'error',fatal:true});expect(lockActions(closed)).toMatchObject({choices:[],retry:false});
    const offline=lockStep(initialLock(),{type:'load_failed',failure:{status:0}});expect(lockActions(offline).retry).toBe(true);
  });
  it('words the weather source',()=>{
    expect(sourceLine(view({weatherSource:'clue'}))).toMatch(/riddle/);
    expect(sourceLine(view({weatherSource:'cache'}))).toMatch(/last reading/);
    expect(sourceLine(view({place:{name:'Porto',source:'chosen'}}))).toBe('Using the place you chose: Porto.');
    expect(sourceLine(view())).toBe('');
  });
  it('keeps the chosen place in this browser only and checks it',()=>{
    const storage=memory();
    expect(writeChosenPlace(storage,{name:'Porto',latitude:41.15,longitude:-8.61,country:'Portugal'})).toBe(true);
    expect(JSON.parse(storage.data.get(LOCK_PLACE_KEY))).toEqual({name:'Porto',latitude:41.15,longitude:-8.61});
    expect(readChosenPlace(storage)).toEqual({name:'Porto',latitude:41.15,longitude:-8.61});
    expect(writeChosenPlace(storage,{name:'Nowhere',latitude:200,longitude:0})).toBe(false);
    writeChosenPlace(storage,null);expect(readChosenPlace(storage)).toBeNull();
    expect(isPlace({name:'',latitude:0,longitude:0})).toBe(false);
    expect(placeLabel({name:'Lisbon',region:'Lisbon',country:'Portugal'})).toBe('Lisbon, Portugal');
  });
});
