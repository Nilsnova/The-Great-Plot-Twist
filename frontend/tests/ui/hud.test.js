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
    window.testHud=createHud(game,{focus(){},start(){window.calls.push('start');},chart(){window.calls.push('chart');},travel(){return true;},controls(){window.calls.push('controls');},tutorial(){window.calls.push('tutorial');},menu(){window.calls.push('menu');}});
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

it('with the island as coin source, the wallet never overwrites the island balance',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(()=>{
      const hud=window.testHud,text=()=>document.querySelector('.hud-coins').textContent;
      const before=text();
      hud.setCoinSource('island');hud.setCoins(100);
      hud.setCaptain({account:{state:'signed_in'},captain:{name:'Captain Fern',coins:700}});
      const island=text();
      hud.setCoins(1250);const big=text();
      hud.setCoinSource('wallet');hud.setCaptain({account:{state:'signed_in'},captain:{name:'Captain Fern',coins:700}});
      return {before,island,big,wallet:text(),label:document.querySelector('.hud-coins').getAttribute('aria-label')};
    });
    expect(result.before).toBe('🪙 …');
    expect(result.island).toBe('🪙 100');
    expect(result.big).toBe('🪙 1,250');
    expect(result.wallet).toBe('🪙 700');expect(result.label).toBe('700 coins');
  });
});

it('counts the loot up to the new balance and says the new balance at once',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(async()=>{
      const hud=window.testHud,text=()=>document.querySelector('.hud-coins').textContent,label=()=>document.querySelector('.hud-coins').getAttribute('aria-label');
      hud.setCoinSource('island');hud.setCoins(100);
      hud.setCoins(160,{tick:true});const first={text:text(),label:label(),coins:hud.coins};
      await new Promise(resolve=>setTimeout(resolve,400));const middle=Number(text().replace(/\D/g,''));
      await new Promise(resolve=>setTimeout(resolve,800));const done=text();
      hud.setCoins(130,{tick:true});const spent=text(); // spending never counts
      return {first,middle,done,spent};
    });
    expect(result.first).toEqual({text:'🪙 100',label:'160 coins',coins:160});
    expect(result.middle).toBeGreaterThan(100);expect(result.middle).toBeLessThan(160);
    expect(result.done).toBe('🪙 160');expect(result.spent).toBe('🪙 130');
  });
});

it('flashes the screen edge red when the island takes damage, never with reduced motion',async()=>{
  await evaluate.withPage(async page=>{
    const result=await page.evaluate(async()=>{
      const {createWaveHud}=await window.g20Import('/src/pirates/hud.js');
      const run=still=>{
        const box=document.createElement('div');document.body.append(box);
        const hud=createWaveHud({container:box,reducedMotion:()=>still});
        hud.bar({wave:1,shipsLeft:3,islandHp:100,maxIslandHp:100});hud.bar({wave:1,shipsLeft:3,islandHp:90,maxIslandHp:100});
        const button=box.querySelector('.pirate-musket'),out={flash:box.querySelector('.pirate-hurt-edge').classList.contains('pirate-flash'),hint:!button.hidden};
        hud.musket({share:.5,ready:true});out.musket=[!button.hidden,button.textContent.includes('Musket')];
        hud.musket({share:1,ready:false});out.idle=button.textContent.includes('No pirate in range');
        hud.musket(null);out.hintLater=!button.hidden;
        hud.dispose();box.remove();return out;
      };
      return {moving:run(false),still:run(true)};
    });
    expect(result.moving).toEqual({flash:true,hint:false,musket:[true,true],idle:true,hintLater:false});
    expect(result.still.flash).toBe(false);
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
    expect(result.three).toEqual(['*Place a 🪙 stake','Invite a friend','Upgrade a cannon']);
    expect(result.progress).toBe('3 of 10');
    expect(result.toast.at(-1)).toMatch(/Goal done: Sail to the Harbor/);
    // After goal 5 the tower-defense goals follow (TOWER-DEFENSE.md §9 order).
    expect(result.done.labels).toEqual(['*Upgrade a cannon','Build a mortar','Win wave 5']);
    expect(result.done.finale).toBe('');expect(JSON.parse(result.done.stored)).toEqual({version:1,done:5});
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

it('offers the sea chart, controls, How to play and a place · weather · time line in the pause menu',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    const result=await page.evaluate(async()=>{
      const {menuExtras,menuStatus}=await window.g20Import('/src/shell/menu-extras.js');
      const extras=menuExtras();extras.forEach(extra=>extra.onSelect());
      return {labels:extras.map(extra=>extra.label),calls:window.calls,status:menuStatus()};
    });
    expect(result.labels).toEqual(['Sea chart','Controls','How to play']);expect(result.calls).toEqual(['start','chart','controls','tutorial']);
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

it('keeps the break between waves clear of the loot toasts and the victory caption at 375 and 1280 px',async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    await page.evaluate(async()=>{await window.g20Import('/src/ui/toasts.css');await window.g20Import('/src/ui/shell.css');await window.g20Import('/src/pirates/pirates.css');});
    for(const [width,height] of [[375,812],[1280,720]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(async()=>{
        const {createWaveHud}=await window.g20Import('/src/pirates/hud.js');
        const {showToast}=await window.g20Import('/src/ui/toasts.js');
        const box=document.createElement('div');box.className='game-layer';document.querySelector('#game').append(box);
        const hud=createWaveHud({container:box});
        hud.pause({title:'Wave 1 won!',line:'3 ships sunk · 🪙 +15',seconds:14,auto:false,ready:true});
        showToast('🪙 +15 loot · you have 🪙 325');showToast('Captain upgrades unlocked! Open Menu › Captain to make your musket stronger.');
        const caption=document.createElement('div');caption.className='sound-caption';caption.textContent='Victory: the island holds';document.body.append(caption);
        await new Promise(resolve=>setTimeout(resolve,300));
        const rect=node=>node.getBoundingClientRect();
        const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
        const brk=rect(box.querySelector('.pirate-break'));
        const others=[...document.querySelectorAll('.u-toast'),caption].filter(node=>node.getClientRects().length);
        const out={covered:others.filter(node=>overlap(brk,rect(node))).map(node=>node.className),toasts:others.length-1,
          inside:brk.top>=0&&brk.bottom<=innerHeight,checkbox:overlap(rect(box.querySelector('.pirate-auto')),brk)};
        hud.pause(null);const toastsBack=rect(document.querySelector('.u-toast')).top;
        out.cleared=document.documentElement.style.getPropertyValue('--pirate-break-bottom')==='';
        hud.dispose();box.remove();caption.remove();document.querySelectorAll('.u-toast').forEach(node=>node.remove());
        out.toastsBack=toastsBack;return out;
      });
      expect(result,`${width}px ${JSON.stringify(result)}`).toMatchObject({covered:[],toasts:2,inside:true,checkbox:true,cleared:true});
      if(width<=760)expect(result.toastsBack).toBeLessThan(200); // the toasts go back under the goals when the break ends
    }
  });
});

it("names a friend's game in the arrival banner, and follows when the host's name arrives late",async()=>{
  await evaluate.withPage(async page=>{
    const result=await page.evaluate(async()=>{
      for(const sheet of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css'])await window.g20Import(sheet);
      localStorage.clear();
      const {createHud}=await window.g20Import('/src/ui/hud.js');
      const game=document.createElement('main');game.id='game';document.body.append(game);
      let name=null;
      const hud=createHud(game,{focus(){},start(){},travel(){return false;},placeName:id=>id==='home_islet'?name:null});
      hud.start();
      const banner=()=>({shown:!document.querySelector('.hud-arrival').hidden,text:document.querySelector('.hud-arrival strong').textContent,status:document.querySelector('.hud .chapter').textContent});
      hud.arrive('home_islet');const own=banner();
      name="A friend's game";hud.arrive('home_islet');const early=banner();
      name="Nils's game";hud.renamePlace();const late=banner();
      hud.dispose();
      return {own,early,late};
    });
    expect(result.own).toEqual({shown:true,text:'Your island',status:'Your island'});
    expect(result.early).toEqual({shown:true,text:"A friend's game",status:"A friend's game"});
    expect(result.late).toEqual({shown:true,text:"Nils's game",status:"Nils's game"});
  });
});

it("keeps a friend's game chip and the goals strip apart at 390, 375 and 1280 px",async()=>{
  await evaluate.withPage(async page=>{
    await mount(page);
    await page.evaluate(async()=>{
      await window.g20Import('/src/island/island.css');
      const {createIslandUi}=await window.g20Import('/src/island/ui.js');
      const {visitChip}=await window.g20Import('/src/island/one-island.js');
      window.testIslandUi=createIslandUi({container:document.querySelector('#game')});
      window.testIslandUi.visit(visitChip({ownerName:'Captain Bartholomew Longname',code:'ISLE-FR3ND'}),()=>{});
    });
    for(const [width,height] of [[390,844],[375,812],[1280,800]]){
      await page.setViewportSize({width,height});
      const result=await page.evaluate(()=>{
        const box=selector=>document.querySelector(selector).getBoundingClientRect();
        const boxes={coins:box('.hud-coins'),menu:box('.hud-menu'),strip:box('.quest-strip'),chip:box('.island-visit')};
        const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
        const pairs=Object.keys(boxes).filter(name=>name!=='chip'&&overlap(boxes.chip,boxes[name]));
        const inside=Object.values(boxes).every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight);
        return {pairs,inside,overflow:document.documentElement.scrollWidth>innerWidth,chip:[boxes.chip.top,boxes.chip.bottom].map(Math.round),strip:Math.round(boxes.strip.top)};
      });
      expect(result,`${width}px ${JSON.stringify(result)}`).toMatchObject({pairs:[],inside:true,overflow:false});
    }
    // Without the chip the strip goes back under the Menu.
    await page.setViewportSize({width:390,height:844});
    const back=await page.evaluate(()=>{window.testIslandUi.visit(null);return Math.round(document.querySelector('.quest-strip').getBoundingClientRect().top);});
    expect(back).toBeLessThan(80);
  });
});
