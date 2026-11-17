import {describe, expect, it, vi} from 'vitest';
import {checkMove, positionsOf, onWallLane} from '../../src/island/placement.js';
import {wallPolicy} from '../../src/island/wall-policy.js';
import {createMoveMode} from '../../src/island/move-mode.js';
import {EXTRA_SPOTS} from '../../src/island/spots.js';
const policy = {wallRuleVersion: 1, wallCapacity: 128, reservedPositions: Object.fromEntries(EXTRA_SPOTS.map(({id,x,z}) => [id,{x,z}]))};
const placed = positionsOf();

describe('exact trusted wall preview policy', () => {
  it('retains old behavior without confusing stored-layout version with permission', () => {
    expect(wallPolicy()).toEqual({wallRuleVersion: 0, wallCapacity: 12});
    expect(wallPolicy({version: 2})).toEqual({wallRuleVersion: 0, wallCapacity: 12});
    expect(onWallLane(4,-19.5)).toBe(false);
    expect(checkMove('wall_1',4,-19.5,placed)).toMatchObject({code: 'off_path'});
    expect(checkMove('wall_1',4,-19.5,placed,policy)).toEqual({ok: true});
  });
  it.each([{wallRuleVersion: true,wallCapacity:128},{wallRuleVersion:1},{wallCapacity:128},
    {wallRuleVersion:2,wallCapacity:128},{wallRuleVersion:0,wallCapacity:128},null,[]])('fails closed for unsupported metadata %j', value => {
    expect(wallPolicy(value)).toBeNull();
    expect(checkMove('wall_13',4,-19.5,placed,value)).toMatchObject({ok:false,code:'layout_unavailable'});
  });
  it.each(['wall_13','wall_128'])('admits canonical cohort boundary %s only under the perimeter policy', id => {
    expect(checkMove(id,4,-19.5,placed)).toMatchObject({code:'no_such_spot'});
    expect(checkMove(id,4,-19.5,placed,policy)).toEqual({ok:true});
  });
  it.each([['wall_129',4,-19.5,'no_such_spot'],['wall_013',4,-19.5,'no_such_spot'],
    ['wall_13',4.25,-19.5,'off_grid'],['wall_13',0,25,'not_on_land'],['wall_13',0,2,'place_taken'],
    ['wall_13',-8,-6,'place_taken']])('preserves other server refusals for %s at %s,%s', (id,x,z,code) => {
    expect(checkMove(id,x,z,placed,policy)).toMatchObject({ok:false,code});
  });
  it('uses real paid coordinates for new occupancy and allows edge sharing', () => {
    const at=positionsOf([{id:'wall_13',kind:'wall',built:true,level:1,x:-4,z:-9}]);
    expect(checkMove('wall_128',-3.5,-9,at,policy)).toMatchObject({code:'place_taken'});
    expect(checkMove('wall_128',-2,-9,at,policy)).toEqual({ok:true});
    expect(positionsOf([{id:'wall_128',kind:'wall',built:false}]).wall_128).toBeUndefined();
  });
});

describe('Move uses its current response metadata and context', () => {
  it('previews a paid new wall off legacy lanes and uses a truthful hint', async () => {
    const api={move:vi.fn(async()=>({ok:true,data:{}}))},render=vi.fn();
    const mode=createMoveMode({api,render,layout:()=>policy,spots:()=>[{id:'wall_13',kind:'wall',built:true,x:4,z:-19.5}]});
    expect(mode.start('wall_13')).toBe(true); mode.tap(-4,-9);
    expect(mode.state.ok).toBe(true); expect(render.mock.lastCall[0].line).not.toContain('pirate path');
    await mode.confirm(); expect(api.move).toHaveBeenCalledWith({spot:'wall_13',x:-4,z:-9,code:null});
  });
  it('never starts default-less unbuilt inventory or trusts a cohort row without the policy', () => {
    const rows=[{id:'wall_128',kind:'wall',built:false}];
    const mode=createMoveMode({api:{},layout:()=>policy,spots:()=>rows}); expect(mode.start('wall_128')).toBe(false);
    rows[0]={id:'wall_128',kind:'wall',built:true,x:4,z:-19.5};
    const legacy=createMoveMode({api:{},spots:()=>rows}); expect(legacy.start('wall_128')).toBe(false);
  });
  it('does not submit an old draft into another island or consume its late response', async () => {
    let code='ISLE-K7Q2M',resolve;const onMoved=vi.fn(),api={move:vi.fn(()=>new Promise(done=>{resolve=done;}))};
    const mode=createMoveMode({api,code:()=>code,layout:()=>policy,onMoved}); mode.start('wall_1');mode.tap(4,-19.5);
    const pending=mode.confirm();code='ISLE-FR3ND';resolve({ok:true,data:{}});await pending;
    expect(onMoved).not.toHaveBeenCalled();expect(mode.active).toBe(false);
    mode.start('wall_1');mode.tap(4,-19.5);code=null;expect(await mode.confirm()).toBeNull();expect(api.move).toHaveBeenCalledTimes(1);
  });
});

describe('unoffered D060 occupancy stays protected', () => {
  it('reserves actual moved hidden tower coordinates without creating a purchase offer', () => {
    const hidden = {...policy, reservedPositions: {...policy.reservedPositions, cannon_8: {x:-4,z:-9}}};
    expect(positionsOf().cannon_8).toBeUndefined();
    expect(checkMove('wall_13',-4,-9,placed,hidden)).toMatchObject({code:'place_taken'});
    expect(checkMove('wall_13',-2,-9,placed,hidden)).toEqual({ok:true});
  });
  it.each([undefined,null,[],{}, {cannon_8:{x:NaN,z:0}}, {unknown:{x:0,z:0}}])('fails closed when missing hidden coordinates cannot be read: %j', reservedPositions => {
    expect(checkMove('wall_13',4,-19.5,placed,{...policy,reservedPositions})).toMatchObject({code:'layout_unavailable'});
  });
  it('accepts an empty reservation map when all four sites are already offered at actual positions', () => {
    const all={...placed,...policy.reservedPositions};
    expect(checkMove('wall_13',4,-19.5,all,{...policy,reservedPositions:{}})).toEqual({ok:true});
    expect(checkMove('wall_13',4,-19.5,all,{...policy,reservedPositions:{cannon_8:{x:-4,z:-9}}})).toMatchObject({code:'layout_unavailable'});
  });
});
