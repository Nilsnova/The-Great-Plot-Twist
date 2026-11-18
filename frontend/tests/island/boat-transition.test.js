// A real personal boat scene must release captain input at the shared wave countdown.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

async function mount(page, delayed = false) {
  await page.evaluate(async delayed => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on,emit} = await window.g20Import('/src/core/events.js');
    window.boatToasts=await window.g20Import('/src/ui/toasts.js');
    const transport = createFakeIslandTransport();transport.dev.setWaveBest(30);
    transport.world.islands.get('K7Q2M').wreck=500;
    let release;const loading=new Promise(resolve=>{release=resolve;});
    window.releaseBoat=release;window.emitBoatEvent=emit;window.boatClaims=0;window.boatFocus=0;window.boatResets=0;
    const post=transport.post;transport.post=(path,body)=>{
      if(path==='/api/island/boat'){
        window.boatClaims++;
        if(window.holdBoatReward)return new Promise(resolve=>{window.payBoatReward=()=>resolve(post(path,body));});
      }
      return post(path,body);
    };
    window.boatIsland=createIsland({container:document.body,emit,on,transport,mode:'fake',storage:null,menu:()=>()=>{},
      focus:()=>window.boatFocus++,resetInput:()=>window.boatResets++,onCoins:value=>{window.boatBalance=value;},loadBoatScene:async()=>{if(delayed)await loading;
        const scene=await window.g20Import('/src/pirates/boat/scene.js');window.boatLoadComplete=true;
        return {createBoatGame:options=>{const round=scene.createBoatGame({...options,autoplay:false});window.boatRound=round;return round;}};}});
    await window.boatIsland.load();window.boatIsland.openWreck();
  },delayed);
  await page.locator('[data-focus="boat-dash"]').click();
}

it('disposes an unfinished round at countdown without claiming coins or reopening the wreck', async () => {
  await browser.withPage(async page => {
    await mount(page);await page.waitForSelector('.boat-game');
    expect(await page.evaluate(()=>window.boatIsland.active)).toBe(true);
    const result=await page.evaluate(()=>{
      window.boatToasts.showToast({text:'Existing connection error',tone:'error'});window.boatResets=0;
      window.emitBoatEvent({type:'wave_started_server',waveId:'coop-wave',wave:31});
      const key=new KeyboardEvent('keydown',{code:'ArrowRight',cancelable:true});window.dispatchEvent(key);
      const result={boats:document.querySelectorAll('.boat-game').length,card:window.boatIsland.ui.open,
        active:window.boatIsland.active,claims:window.boatClaims,consumed:key.defaultPrevented,focus:window.boatFocus,
        message:document.querySelector('.island-boat-notice')?.textContent,visible:!document.querySelector('.island-boat-notice')?.hidden,resets:window.boatResets,
        error:document.querySelector('.u-toast-text')?.textContent};
      window.boatIsland.dispose();return result;
    });
    expect(result).toMatchObject({boats:0,card:null,active:false,claims:0,consumed:false,visible:true});
    expect(result.focus).toBeGreaterThan(0);
    expect(result.resets).toBeGreaterThan(0);expect(result.error).toContain('Existing connection error');
    expect(result.message).toContain('Wave starting');
    expect(result.message).toContain('No coins were spent');
    expect(result.message).toContain('did not use a reward');
  });
});

it('does not open a delayed scene after a wave has started and stopped', async () => {
  await browser.withPage(async page => {
    await mount(page,true);
    await page.evaluate(()=>{
      window.boatIsland.setBattle(true);window.boatIsland.setBattle(false);window.releaseBoat();
    });
    await page.waitForFunction(()=>window.boatLoadComplete===true);
    expect(await page.locator('.island-card[open]').count()).toBe(0);
    expect(await page.locator('.boat-game').count()).toBe(0);
    await page.evaluate(()=>window.boatIsland.dispose());
  });
});

it('still returns to the wreck when the player leaves a round normally', async () => {
  await browser.withPage(async page => {
    await mount(page);await page.waitForSelector('.boat-game');await page.keyboard.press('Escape');
    await page.waitForSelector('.island-card[open]');
    expect(await page.locator('.boat-game').count()).toBe(0);
    expect(await page.evaluate(()=>window.boatIsland.ui.open)).toBe('wreck');
    await page.evaluate(()=>window.boatIsland.dispose());
  });
});

it('keeps a completed round payout that arrives after the countdown interruption', async () => {
  await browser.withPage(async page => {
    await mount(page);await page.waitForSelector('.boat-game');
    const before=await page.evaluate(async()=>{
      window.holdBoatReward=true;
      const rules=await window.g20Import('/src/pirates/boat/rules.js');
      const difficulty=rules.boatDifficulty('dash',30), salt=rules.boatSalt('ISLE-K7Q2M',30,'dash');
      const items=rules.itemsOf(salt,difficulty), round=window.boatRound;
      for(let i=0;i<30;i++)round.update(.1);
      for(let sample=0;sample<=rules.BOAT.samples;sample++){
        const next=items.find(item=>item.kind==='coin'&&item.at>=sample+1);
        round.aim(next?.x??50);round.update(.1);
      }
      const result={phase:round.phase,stars:round.outcome?.stars,balance:window.boatBalance,claims:window.boatClaims};
      window.emitBoatEvent({type:'wave_started_server',waveId:'completed-coop-wave',wave:31});
      return result;
    });
    expect(before).toMatchObject({phase:'result',claims:1});expect(before.stars).toBeGreaterThan(0);
    await page.evaluate(()=>window.payBoatReward());
    await page.waitForFunction(before=>window.boatBalance>before,before.balance);
    expect((await page.evaluate(()=>window.boatBalance))-before.balance).toBe(before.stars*12);
    expect(await page.locator('.u-toast-text').textContent()).toContain('Boat reward: +');
    expect(await page.locator('.island-boat-notice').textContent()).toContain('completed round keeps any coins earned');
    expect(await page.locator('.island-boat-notice').isVisible()).toBe(true);
    expect(await page.locator('.boat-game, .island-card[open]').count()).toBe(0);
    expect(await page.evaluate(()=>window.boatIsland.active)).toBe(false);
    await page.evaluate(()=>window.boatIsland.dispose());
  });
});

for (const [width,height] of [[320,568],[844,390]]) {
  it(`keeps the interruption clear of the real wave HUD at ${width} by ${height}`, async () => {
    await browser.withPage(async page => {
      await page.setViewportSize({width,height});
      await page.evaluate(async()=>{
        for(const path of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css']) await window.g20Import(path);
        const {createHud}=await window.g20Import('/src/ui/hud.js');
        const {createWaveHud}=await window.g20Import('/src/pirates/hud.js');
        window.playHud=createHud(document.body,{hasIsland:()=>true,travel:()=>false});
        window.waveHud=createWaveHud({container:document.body});
      });
      await mount(page);await page.waitForSelector('.boat-game');
      await page.evaluate(()=>{
        window.waveHud.bar({wave:31,shipsLeft:3,islandHp:100,maxIslandHp:100});
        window.waveHud.health({hp:100,maxHp:100,down:false});window.waveHud.countdown(9);
        window.boatToasts.showToast({text:'Existing connection error',tone:'error'});
        window.emitBoatEvent({type:'wave_started_server',waveId:'layout-wave',wave:31});
      });
      // Real ResizeObservers settle the bar, status and countdown dimensions.
      await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
      const layout=await page.evaluate(()=>{
        const bounds=selector=>{
          const box=document.querySelector(selector).getBoundingClientRect();
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};
        };
        const notice=bounds('.island-boat-notice');
        const overlaps=selector=>{const box=bounds(selector);return notice.left<box.right&&notice.right>box.left&&notice.top<box.bottom&&notice.bottom>box.top;};
        return {notice,countdown:bounds('.pirate-countdown'),number:bounds('.pirate-countdown-number'),overlaps:['.pirate-bar','.pirate-countdown','.u-toasts'].filter(overlaps),
          overflow:document.documentElement.scrollWidth>innerWidth};
      });
      expect(layout.overlaps).toEqual([]);expect(layout.overflow).toBe(false);
      expect(layout.notice.top).toBeGreaterThanOrEqual(0);expect(layout.notice.bottom).toBeLessThanOrEqual(height);
      expect(layout.countdown.bottom).toBeLessThanOrEqual(height);
      expect(layout.number.bottom).toBeLessThanOrEqual(height);
      if(width>=600){
        await page.evaluate(()=>{
          window.waveHud.event({id:'storm',title:'Storm',line:'Rough seas',open:true});
          window.waveHud.boss('Boss warship');
        });
        await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
        const gap=await page.evaluate(()=>{
          const box=selector=>document.querySelector(selector).getBoundingClientRect();
          return box('.pirate-boss').top-Math.max(box('.island-boat-notice').bottom,box('.pirate-countdown').bottom);
        });
        expect(gap).toBeGreaterThanOrEqual(0);expect(gap).toBeLessThanOrEqual(18);
      }
      await page.evaluate(()=>{window.waveHud.event(null);window.waveHud.boss(null);});
      await page.setViewportSize(width===320?{width:844,height:390}:{width:320,height:568});
      await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
      const rotated=await page.evaluate(()=>{
        const notice=document.querySelector('.island-boat-notice').getBoundingClientRect();
        const toast=document.querySelector('.u-toasts').getBoundingClientRect();
        return {overlap:notice.top<toast.bottom&&notice.bottom>toast.top&&notice.left<toast.right&&notice.right>toast.left,
          countdownBottom:document.querySelector('.pirate-countdown-number').getBoundingClientRect().bottom,height:innerHeight};
      });
      expect(rotated.overlap).toBe(false);expect(rotated.countdownBottom).toBeLessThanOrEqual(rotated.height);
      await page.evaluate(()=>{window.boatIsland.dispose();window.waveHud.dispose();window.playHud.dispose();});
    });
  });
}
