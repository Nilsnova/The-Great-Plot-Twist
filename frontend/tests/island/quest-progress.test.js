// Saved own-island achievements reach the real HUD; visiting a friend's island grants no credit.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('recovers saved goals, persists them and releases earlier achievements after inviting', async () => {
  const result = await browser(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    localStorage.clear();
    const transport = createFakeIslandTransport();
    await transport.api.island();transport.dev.setWaveBest(10);transport.dev.setCoins(1000);
    await transport.api.build({spot:'cannon_1',kind:'cannon',actionUid:'quest-cannon'});
    await transport.api.upgrade({spot:'cannon_1',actionUid:'quest-upgrade'});
    await transport.api.build({spot:'wall_1',kind:'wall',actionUid:'quest-wall'});
    await transport.api.build({spot:'cannon_2',kind:'mortar',actionUid:'quest-mortar'});
    await transport.api.hire({crew:'gunner',actionUid:'quest-gunner-1'});
    await transport.api.hire({crew:'gunner',actionUid:'quest-gunner-2'});
    const hud = createHud(document.body,{focus(){},travel:()=>false},{on,emit,toast(){}});
    const island = createIsland({container:document.body,on,emit,transport,mode:'fake',storage:null,
      onQuestIsland:value=>hud.setQuestIsland(value),menu:()=>()=>{}});
    await island.load();
    const before = hud.quests.done;
    hud.setGuide({title:'First steps',progress:'1 of 2',items:[],allDone:false});
    island.openInvite();
    const after = hud.quests.done, stored = JSON.parse(localStorage.getItem('plot_twist_first_quests_v1'));
    const guided = document.querySelector('.quest-name').textContent;
    hud.setGuide(null);
    island.dispose();hud.dispose();
    // A separately loaded old save at the reported deadlock also recovers without another purchase.
    localStorage.setItem('plot_twist_first_quests_v1',JSON.stringify({version:1,done:8}));
    const restored = createHud(document.body,{focus(){},travel:()=>false},{on,emit,toast(){}});
    restored.setQuestIsland(await transport.api.island());
    const recovered = restored.quests.done;
    restored.dispose();
    return {before,after,stored,guided,recovered};
  });
  expect(result).toEqual({before:4,after:10,stored:{version:1,done:10},guided:'First steps',recovered:10});
});

it('does not use the visited island to satisfy the gunner goal', async () => {
  const result = await browser(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on,emit} = await window.g20Import('/src/core/events.js');
    localStorage.setItem('plot_twist_first_quests_v1',JSON.stringify({version:1,done:8}));
    const transport = createFakeIslandTransport();
    await transport.api.island();
    const friend = transport.world.islands.get('FR3ND');friend.crew.gunner=2;friend.waveBest=10;
    const hud = createHud(document.body,{focus(){}},{on,emit,toast(){}});
    const seen=[];
    const island = createIsland({container:document.body,on,emit,transport,mode:'fake',storage:null,visitStorage:null,
      onQuestIsland:value=>{seen.push(value.code);hud.setQuestIsland(value);},menu:()=>()=>{}});
    await island.load();island.visit('FR3ND');await island.load();
    const result={done:hud.quests.done,seen,visiting:island.visiting?.code};
    island.dispose();hud.dispose();return result;
  });
  expect(result.done).toBe(8);
  expect(result.visiting).toBe('FR3ND');
  expect(result.seen.every(code=>code==='ISLE-K7Q2M')).toBe(true);
});
