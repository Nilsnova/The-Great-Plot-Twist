// Lane U2/U3 in real Chromium: the play HUD keeps exactly three groups (🪙, Menu, quest strip), the strip
// follows bus events, the class demo can show its own goals, and nothing overlaps at 320, 375 or 1280 px.
import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();

async function mount(page){
  await page.evaluate(async()=>{
    for(const sheet of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css','/src/ui/readability.css','/src/ui/devices.css'])await window.g20Import(sheet);
    localStorage.clear();
    window.events=await window.g20Import('/src/core/events.js');
    const {createHud}=await window.g20Import('/src/ui/hud.js');window.calls=[];
    const game=document.createElement('main');game.id='game';document.body.append(game);
    window.testHud=createHud(game,{focus(){},start(){window.calls.push('start');},chart(){window.calls.push('chart');},controls(){window.calls.push('controls');},menu(){window.calls.push('menu');}});
    window.testHud.start();
  });
}

it('keeps exactly three interactive HUD groups during play: coins, Menu and the quest strip',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(()=>{
      const groups=[...document.querySelectorAll('.hud [data-hud-group]')].filter(node=>node.getClientRects().length).map(node=>node.dataset.hudGroup);
      const text=document.querySelector('.hud').textContent;
      return {groups,buttonsOutsideGroups:[...document.querySelectorAll('.hud button')].filter(button=>!button.closest('[data-hud-group]')).length,
        gone:['.masthead','.controls-toggle','.chart-toggle','.settings-toggle','.bottom-bar','.debug','.case-toolbar','.journal-toggle'].filter(selector=>document.querySelector(selector)),
        signIn:/sign in|github/i.test(text),coins:document.querySelector('.hud-coins').textContent,menu:document.querySelector('.hud-menu').textContent};
    });
    expect(result.groups).toEqual(['coins','menu','quests']);
    expect(result).toMatchObject({buttonsOutsideGroups:0,gone:[],signIn:false,menu:'Menu'});
    expect(result.coins).toContain('🪙');
    await page.locator('.hud-menu').click();
    expect(await page.evaluate(()=>window.calls)).toEqual(['start','menu']);
  });
});

it('shows coins as 🪙 n, never a captain name, and warns once when the sign-in runs out',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(()=>{
      const hud=window.testHud;
      hud.setCaptain({account:{state:'signed_in'},captain:{name:'<img src=x onerror=alert(1)>',coins:120}});
      const signedIn={coins:document.querySelector('.hud-coins').textContent,label:document.querySelector('.hud-coins').getAttribute('aria-label'),
        name:document.querySelector('.hud').textContent.includes('<img'),images:document.querySelectorAll('.hud img').length};
      hud.setCoins(135);const set=document.querySelector('.hud-coins').textContent;
      hud.setCaptain({account:{state:'expired'},captain:{name:'Captain Fern',coins:null}});hud.setCaptain({account:{state:'expired'},captain:{name:'Captain Fern',coins:null}});
      const toasts=[...document.querySelectorAll('.u-toast')].map(node=>node.textContent);
      return {signedIn,set,kept:document.querySelector('.hud-coins').textContent,toasts};
    });
    expect(result.signedIn).toEqual({coins:'🪙 120',label:'120 coins',name:false,images:0});
    expect(result.set).toBe('🪙 135');expect(result.kept).toBe('🪙 135');
    expect(result.toasts).toHaveLength(1);expect(result.toasts[0]).toMatch(/Sign in again/);
  });
});

it('moves the quest strip with the bus events of the other lanes, three goals at a time',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(async()=>{
      const {QUEST_EVENTS}=await window.g20Import('/src/ui/quest-events.js');const {emit}=window.events;
      const labels=()=>[...document.querySelectorAll('.quest-item')].map(item=>`${item.dataset.done==='true'?'✓':item.dataset.current?'*':''}${item.querySelector('.quest-label').textContent}`);
      const start=labels();
      emit({type:'arrived',place:'saltreach_harbor'});emit({type:QUEST_EVENTS.HARBOR_STAKE_PLACED});
      const early=labels();
      emit({type:QUEST_EVENTS.ISLAND_BUILT,kind:'wall'});emit({type:QUEST_EVENTS.ISLAND_BUILT,kind:'cannon'});
      emit({type:QUEST_EVENTS.WAVE_FINISHED,survived:true});emit({type:'arrived',place:'saltreach_harbor'});
      const three=labels(),progress=document.querySelector('.quest-progress').textContent;
      const toast=[...document.querySelectorAll('.u-toast')].map(node=>node.textContent);
      emit({type:QUEST_EVENTS.HARBOR_STAKE_PLACED});emit({type:QUEST_EVENTS.ISLAND_INVITE_OPENED});
      const done={labels:labels(),finale:document.querySelector('.quest-next').textContent,stored:localStorage.getItem('plot_twist_first_quests_v1')};
      window.testHud.setQuests({title:'Class goals',progress:'0 of 3 done',allDone:false,finale:'',items:[{id:'wave',label:'Wave to a captain',hint:'Walk up.',step:1,done:false,current:true}]});
      const klass={title:document.querySelector('.quest-name').textContent,labels:labels()};
      window.testHud.setQuests(null);const back=document.querySelector('.quest-name').textContent;
      return {start,early,three,progress,toast,done,klass,back};
    });
    expect(result.start).toEqual(['*Build a cannon','Ring the bell and win a wave','Sail to the Harbor']);
    expect(result.early).toEqual(result.start);
    expect(result.three).toEqual(['✓Sail to the Harbor','*Place a 🪙 stake','Invite a friend']);
    expect(result.progress).toBe('3 of 5');
    expect(result.toast.at(-1)).toMatch(/Goal done: Sail to the Harbor/);
    expect(result.done.labels).toEqual(['✓Sail to the Harbor','✓Place a 🪙 stake','✓Invite a friend']);
    expect(result.done.finale).toMatch(/All goals done/);expect(JSON.parse(result.done.stored)).toEqual({version:1,done:5});
    expect(result.klass).toEqual({title:'Class goals',labels:['*Wave to a captain']});expect(result.back).toBe('Goals');
  });
});

it('shows a friendly hint after 20 s standing still, and the place name for 2 s on arrival',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(async()=>{
      let now=performance.now();const real=performance.now.bind(performance);performance.now=()=>now;
      const frames=(seconds,stats={})=>{for(let i=0;i<seconds*5;i++){now+=200;window.testHud.update(null,{speed:0,...stats});}};
      frames(19);const before=document.querySelectorAll('.u-toast').length;
      frames(1.2);const hint=[...document.querySelectorAll('.u-toast')].map(node=>node.textContent);
      frames(30);const once=document.querySelectorAll('.u-toast').length;
      performance.now=real;
      window.testHud.arrive('home_islet');const banner=document.querySelector('.hud-arrival');
      const shown={hidden:banner.hidden,text:banner.textContent,status:document.querySelector('.hud .chapter').textContent};
      await new Promise(resolve=>setTimeout(resolve,2200));
      return {before,hint,once,shown,hiddenAfter:banner.hidden};
    });
    expect(result.before).toBe(0);expect(result.hint).toHaveLength(1);expect(result.hint[0]).toMatch(/Need a hand\?.*cannon/);
    expect(result.once).toBeLessThanOrEqual(1);
    expect(result.shown.hidden).toBe(false);expect(result.shown.text).toMatch(/Your island|Home/i);expect(result.shown.status).toBe(result.shown.text.replace(/^You have arrived/,''));
    expect(result.hiddenAfter).toBe(true);
  });
});

it('offers the sea chart, controls and a place · weather · time line in the pause menu',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(async()=>{
      const {menuExtras,menuStatus}=await window.g20Import('/src/shell/menu-extras.js');
      const extras=menuExtras();extras.forEach(extra=>extra.onSelect());
      return {labels:extras.map(extra=>extra.label),calls:window.calls,status:menuStatus()};
    });
    expect(result.labels).toEqual(['Sea chart','Controls']);expect(result.calls).toEqual(['start','chart','controls']);
    expect(result.status).toMatch(/^Saltreach Harbor · (Fair skies|Overcast|Sea mist|Rain at sea) · \d\d:\d\d$/);
  });
});

it('keeps the three groups apart and inside the screen at 320, 375 and 1280 px',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    for(const [width,height] of [[320,568],[375,812],[1280,720]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(async()=>{
        const {showToast}=await window.g20Import('/src/ui/toasts.js');showToast('A toast that should not cover the HUD');
        const box=selector=>document.querySelector(selector).getBoundingClientRect();
        const boxes={coins:box('.hud-coins'),menu:box('.hud-menu'),strip:box('.quest-strip'),toast:box('.u-toast')};
        const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
        const names=Object.keys(boxes),pairs=[];
        for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)if(overlap(boxes[names[i]],boxes[names[j]]))pairs.push(`${names[i]}+${names[j]}`);
        const inside=Object.values(boxes).every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight);
        const small=[...document.querySelectorAll('.hud *,.u-toast *')].filter(node=>node.getClientRects().length&&node.textContent.trim()&&!node.children.length&&parseFloat(getComputedStyle(node).fontSize)<16).map(node=>node.className||node.tagName);
        const targets=[...document.querySelectorAll('.hud button')].filter(node=>node.getClientRects().length).every(node=>node.getBoundingClientRect().height>=44);
        return {boxes:Object.fromEntries(Object.entries(boxes).map(([k,r])=>[k,[r.left,r.top,r.right,r.bottom].map(Math.round)])),pairs,inside,small,targets,overflow:document.documentElement.scrollWidth>innerWidth,visibleGoals:[...document.querySelectorAll('.quest-item')].filter(node=>node.getClientRects().length).length};
      });
      expect(result,`${width}px ${JSON.stringify(result)}`).toMatchObject({pairs:[],inside:true,small:[],targets:true,overflow:false});
      expect(result.visibleGoals).toBe(width<=900?1:3);
    }
  });
});
