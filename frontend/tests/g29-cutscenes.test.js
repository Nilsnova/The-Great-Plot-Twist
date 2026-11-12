// G29 C1: cutscene scripts, scenes and timing rules, checked without a browser.
import {describe,expect,it} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import data from '../src/cutscenes/scripts.json';
import {scenes} from '../src/cutscenes/scenes.js';
import {findScript,normalizeManifest,buildTimeline,lineAt,shotOpacity,shotProgress,VOICE_TAIL} from '../src/cutscenes/timeline.js';

const total=id=>findScript(data,id).lines.reduce((sum,line)=>sum+line.seconds,0);
const publicFile=path=>new URL(`../public/${path}`,import.meta.url);

describe('cutscene scripts',()=>{
  it('holds the pirate-game scripts with their target lengths',()=>{
    expect(data.scripts.map(script=>script.id)).toEqual(['lore_intro','harbor_arrival','lock_opens','lamps_relit','island_arrival','wave_won','wave_lost','armada']);
    for(const id of ['island_arrival','wave_won','wave_lost']){expect(total(id)).toBeGreaterThanOrEqual(5);expect(total(id)).toBeLessThanOrEqual(8);}
    expect(total('armada')).toBeGreaterThanOrEqual(8);expect(total('armada')).toBeLessThanOrEqual(15);
    expect(total('lore_intro')).toBeGreaterThanOrEqual(22);expect(total('lore_intro')).toBeLessThanOrEqual(28);
    expect(total('harbor_arrival')).toBeGreaterThanOrEqual(5);expect(total('harbor_arrival')).toBeLessThanOrEqual(8);
    for(const id of ['lock_opens','lamps_relit']){expect(total(id)).toBeGreaterThanOrEqual(15);expect(total(id)).toBeLessThanOrEqual(30);}
  });
  it('ships no reveal script since the mystery left the game',()=>{
    expect(data.scripts.find(script=>script.id==='reveal')).toBeUndefined();
    expect(findScript(data,'reveal')).toBeNull();
  });
  it('uses short plain lines with unique voice ids and no reveal words',()=>{
    const ids=new Set();
    for(const script of data.scripts)for(const line of script.lines){
      expect(line.id).toMatch(new RegExp(`^${script.id}_\\d{2}$`));expect(ids.has(line.id)).toBe(false);ids.add(line.id);
      expect(line.text.split(/\s+/).length).toBeLessThanOrEqual(15);
      expect(line.seconds).toBeGreaterThan(1);expect(line.seconds).toBeLessThan(8);
      expect(line.text).not.toMatch(/culprit|guilty|masked|schooner|false light|accus|confess|kidnap|murder/i);
    }
  });
  it('builds a scene for every script from cartoon panels drawn in code, with no image files (T21)',async()=>{
    const {PANELS}=await import('../src/art/scenery.js');
    for(const script of data.scripts)expect(scenes[script.id],script.id).toBeDefined();
    for(const [id,shots] of Object.entries(scenes)){
      const script=findScript(data,id);expect(script).not.toBeNull();
      expect(shots[0].from,id).toBe(0);
      for(const shot of shots){
        expect(shot.from).toBeLessThanOrEqual(shot.to);expect(shot.to).toBeLessThan(script.lines.length);
        expect(PANELS[shot.panel],`${id} ${shot.panel}`).toBeDefined();
        expect(shot.layers,id).toBeUndefined();
        expect(['dusk','night','dawn','day','harbor'],id).toContain(shot.sky);
      }
    }
  });
  it('ships a valid voice manifest that voices every scripted line, and nothing else',()=>{
    const manifest=JSON.parse(readFileSync(publicFile('audio/voice/manifest.json'),'utf8'));
    expect(manifest.version).toBe(1);
    const voiced=normalizeManifest(manifest);
    const scripted=data.scripts.flatMap(script=>script.lines.map(line=>line.id)).sort();
    expect(Object.keys(voiced).sort()).toEqual(scripted);
    for(const id of scripted){
      const {file,seconds}=voiced[id];
      expect(file).toBe(`${id}.mp3`);expect(existsSync(publicFile(`audio/voice/${file}`))).toBe(true);
      const bytes=readFileSync(publicFile(`audio/voice/${file}`));
      expect(bytes.length).toBeGreaterThan(1000);expect(bytes.length).toBeLessThan(40_000);
      expect(seconds).toBeGreaterThan(1);expect(seconds).toBeLessThan(8);
    }
  });
});

describe('cutscene timeline',()=>{
  const script={id:'demo',lines:[{id:'demo_01',text:'One.',seconds:2},{id:'demo_02',text:'Two.',seconds:3}]};
  it('keeps target times without voices and stretches a line for a longer recording',()=>{
    const silent=buildTimeline(script);
    expect(silent.total).toBe(5);expect(silent.lines.map(line=>[line.start,line.end])).toEqual([[0,2],[2,5]]);
    const voiced=buildTimeline(script,{demo_01:{file:'demo_01.mp3',seconds:3}});
    expect(voiced.lines[0].end).toBeCloseTo(3+VOICE_TAIL);expect(voiced.total).toBeCloseTo(6+VOICE_TAIL);
    expect(voiced.lines[0].voice).toEqual({file:'demo_01.mp3',seconds:3});expect(voiced.lines[1].voice).toBeNull();
  });
  it('accepts only safe manifest entries',()=>{
    expect(normalizeManifest({version:1,lines:{ok_01:{file:'ok_01.mp3',seconds:2.5},bad:{file:'../x.mp3'},
      'Bad Id':{file:'a.mp3'},no_time:{file:'no_time.ogg',seconds:-1}}}))
      .toEqual({ok_01:{file:'ok_01.mp3',seconds:2.5},no_time:{file:'no_time.ogg',seconds:null}});
    for(const value of [null,{},{version:2,lines:{}},{version:1,lines:'x'}])expect(normalizeManifest(value)).toEqual({});
  });
  it('finds the line on screen and ends after the last one',()=>{
    const timeline=buildTimeline(script);
    expect(lineAt(timeline,0).id).toBe('demo_01');expect(lineAt(timeline,2).id).toBe('demo_02');
    expect(lineAt(timeline,5)).toBeNull();expect(lineAt(timeline,-1)).toBeNull();
  });
  it('fades shots in and out, and cuts with reduced motion',()=>{
    const timeline=buildTimeline(script,{},[{from:0,to:0},{from:1,to:1}]);
    const [first,second]=timeline.shots;
    expect(second).toMatchObject({start:2,end:5});
    expect(shotOpacity(first,0,{total:5})).toBe(1);
    expect(shotOpacity(second,2.3,{total:5})).toBeCloseTo(.5);
    expect(shotOpacity(second,2.3,{total:5,reduced:true})).toBe(1);
    expect(shotOpacity(second,4.85,{total:5})).toBeCloseTo(.25);
    expect(shotOpacity(first,2.1,{total:5})).toBe(0);
    expect(shotProgress(second,3.5)).toBeCloseTo(.5);expect(shotProgress(second,3.5,{reduced:true})).toBe(0);
  });
});
