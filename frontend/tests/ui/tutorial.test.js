// How to play in real Chromium: the paged card (Back / Next, dots, arrow keys, Escape, swipe), its
// size at 320 to 1280 px, the Menu host, and the first-run pages after the intro, shown once.
import {expect,it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate=browserHarness();

async function styles(page){
  await page.evaluate(async()=>{for(const sheet of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css','/src/ui/readability.css'])await window.g20Import(sheet);});
}
const state=page=>page.evaluate(()=>{
  const card=document.querySelector('.tutorial-card');
  return card&&{open:card.open,page:card.dataset.page,title:card.querySelector('.tutorial-title').textContent,
    current:[...card.querySelectorAll('.tutorial-dot')].findIndex(dot=>dot.classList.contains('is-current')),dots:card.querySelectorAll('.tutorial-dot').length,
    buttons:[...card.querySelectorAll('.tutorial-nav button')].map(button=>`${button.textContent}${button.disabled?' (off)':''}`),
    status:card.querySelector('[role="status"]').textContent,focus:document.activeElement?.textContent??''};
});

it('pages with Next and Back, moves the dots, turns with arrow keys and a swipe, and closes with Escape',async()=>{
  await evaluate.withPage(async page=>{
    await styles(page);
    await page.evaluate(async()=>{
      const {createTutorialCard}=await window.g20Import('/src/tutorial/card.js');
      window.card=createTutorialCard({mode:'menu'});window.card.open(document.body);
      window.card.done.then(reason=>{window.reason=reason;});
    });
    expect(await state(page)).toMatchObject({open:true,page:'island',title:'Your island and coins',current:0,dots:11,
      buttons:['Close','Back (off)','Next'],status:'Page 1 of 11: Your island and coins',focus:'Next'});
    expect(await page.locator('.tutorial-card h2').textContent()).toBe('How to play');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    expect(await state(page)).toMatchObject({page:'build',current:1,buttons:['Close','Back','Next']});
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    expect(await state(page)).toMatchObject({page:'captain',current:3});
    await page.keyboard.press('ArrowLeft');
    expect(await state(page)).toMatchObject({page:'bell',current:2});
    // Back to the first page with Back: focus moves to Next instead of staying on a switched-off button.
    await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();
    expect(await state(page)).toMatchObject({page:'island',buttons:['Close','Back (off)','Next'],focus:'Next'});
    // A swipe to the left turns the page, a small or vertical drag does not.
    const box=await page.locator('.tutorial-page').boundingBox(),y=box.y+box.height/2;
    await page.mouse.move(box.x+box.width-40,y);await page.mouse.down();await page.mouse.move(box.x+40,y+8,{steps:4});await page.mouse.up();
    expect(await state(page)).toMatchObject({page:'build'});
    await page.mouse.move(box.x+100,y);await page.mouse.down();await page.mouse.move(box.x+120,y+60,{steps:4});await page.mouse.up();
    expect(await state(page)).toMatchObject({page:'build'});
    // The last page: no Next past it; its button says Done. The controls page lists the keys.
    for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
    expect(await state(page)).toMatchObject({page:'controls',current:10,buttons:['Close','Back','Done']});
    expect(await page.locator('.tutorial-keys dt').allTextContents()).toEqual(['WASD or arrows','E','F','Click','M','Mouse wheel']);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(()=>window.reason)).toBe('closed');
    expect(await page.evaluate(()=>window.card.isOpen)).toBe(false);
  });
});

it('fits 320, 390 and 1280 px wide screens with 44 px tap targets and no sideways scrolling',async()=>{
  await evaluate.withPage(async page=>{
    await styles(page);
    await page.evaluate(async()=>{const {createTutorialCard}=await window.g20Import('/src/tutorial/card.js');window.card=createTutorialCard({mode:'menu'});window.card.open(document.body);});
    for(const [width,height] of [[320,568],[390,844],[1280,800]]){
      await page.setViewportSize({width,height});
      for(let i=0;i<11;i++){
        const result=await page.evaluate(()=>{
          const card=document.querySelector('.tutorial-card'),rect=card.getBoundingClientRect();
          const small=[...card.querySelectorAll('button')].map(button=>button.getBoundingClientRect()).filter(box=>box.width<44||box.height<44).length;
          const art=card.querySelector('.tutorial-art'),artBox=art.getBoundingClientRect();
          const sprites=[...art.querySelectorAll('img')].every(image=>image.getBoundingClientRect().right<=artBox.right+1&&image.getBoundingClientRect().left>=artBox.left-1);
          return {page:card.dataset.page,inside:rect.left>=0&&rect.right<=innerWidth,small,sideways:card.scrollWidth>card.clientWidth||document.documentElement.scrollWidth>innerWidth,sprites};
        });
        expect(result,`${width} ${result.page}`).toMatchObject({inside:true,small:0,sideways:false,sprites:true});
        await page.evaluate(()=>window.card.next());
      }
      await page.evaluate(()=>{for(let i=0;i<11;i++)window.card.back();});
    }
  });
});

it('opens from the Menu host once, blocks the world while open, and hands focus back on close',async()=>{
  await evaluate.withPage(async page=>{
    await styles(page);
    const result=await page.evaluate(async()=>{
      const {createTutorialHost}=await window.g20Import('/src/tutorial/host.js');const closed=[];
      const host=createTutorialHost(document.body,{onClose:reason=>closed.push(reason)});
      const opening=host.open();const loading=host.active;await opening;await host.open();
      const open={active:host.active,cards:document.querySelectorAll('.tutorial-card[open]').length,mode:document.querySelector('.tutorial-card').dataset.mode};
      document.querySelector('.tutorial-card').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      await new Promise(resolve=>setTimeout(resolve,0));
      return {loading,open,after:host.active,left:document.querySelectorAll('.tutorial-card').length,closed};
    });
    expect(result).toEqual({loading:true,open:{active:true,cards:1,mode:'menu'},after:false,left:0,closed:['closed']});
  });
});

async function frontDoor(page,{session=[]}={}){
  await page.evaluate(async session=>{
    const {createFrontDoor}=await window.g20Import('/src/front-door/index.js');window.log=[];
    const values=window.values??=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const tab=new Map(session),sessionStorage={getItem:key=>tab.get(key)??null,setItem:(key,value)=>tab.set(key,value),removeItem:key=>tab.delete(key)};
    window.game={begin:async(...args)=>window.log.push(['begin',...args]),playArrival:async()=>window.log.push(['arrival'])};
    window.door=createFrontDoor({container:document.body,storage,session:sessionStorage,focus:()=>window.log.push(['focus']),
      loadPlayer:async()=>({playCutscene:({id})=>{window.log.push(['cutscene',id]);let done;const promise=new Promise(resolve=>{done=resolve;});window.finishCutscene=()=>done({status:'skipped'});return {done:promise,skip(){done({status:'skipped'});},dispose(){}};}})});
  },session);
}

it('shows the first four pages once after the intro, with Skip and Start playing, then the goal card',async()=>{
  await evaluate.withPage(async page=>{
    await styles(page);
    await frontDoor(page);
    await page.evaluate(()=>{window.first=window.door.run({loadGame:async()=>window.game});});
    await page.waitForFunction(()=>window.log.some(([name])=>name==='cutscene'));
    await page.evaluate(()=>window.finishCutscene());
    await page.locator('.tutorial-card[open]').waitFor();
    expect(await state(page)).toMatchObject({page:'island',dots:4,buttons:['Skip','Back (off)','Next'],focus:'Next'});
    expect(await page.evaluate(()=>[window.door.active,window.values.has('plot_twist_tutorial_v1'),window.log.some(([name])=>name==='begin')])).toEqual([true,false,false]);
    for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next',exact:true}).click();
    expect(await state(page)).toMatchObject({page:'captain',current:3,buttons:['Skip','Back','Start playing']});
    await page.getByRole('button',{name:'Start playing',exact:true}).click();
    await page.locator('.goal-card[open]').waitFor();
    expect(await page.evaluate(()=>window.values.get('plot_twist_tutorial_v1'))).toBe('1');
    expect(await page.locator('.tutorial-card').count()).toBe(0);
    await page.getByRole('button',{name:'Got it',exact:true}).click();
    expect(await page.evaluate(async()=>{await window.first;return window.log.map(([name])=>name);})).toEqual(['cutscene','begin','arrival','focus']);
    // Replay the intro: the lore again, the pages not.
    await page.evaluate(()=>{window.log=[];window.again=window.door.run({loadGame:async()=>window.game,replay:true});});
    await page.waitForFunction(()=>window.log.some(([name])=>name==='cutscene'));await page.evaluate(()=>window.finishCutscene());
    await page.locator('.goal-card[open]').waitFor();
    expect(await page.locator('.tutorial-card').count()).toBe(0);
    await page.keyboard.press('Escape');await page.evaluate(()=>window.again);
  });
});

it('Escape skips the first-run pages and remembers them; a class-code player never sees them',async()=>{
  await evaluate.withPage(async page=>{
    await styles(page);
    await frontDoor(page);
    await page.evaluate(()=>{window.first=window.door.run({loadGame:async()=>window.game});});
    await page.waitForFunction(()=>window.log.some(([name])=>name==='cutscene'));await page.evaluate(()=>window.finishCutscene());
    await page.locator('.tutorial-card[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.goal-card[open]').waitFor();
    expect(await page.evaluate(()=>window.values.get('plot_twist_tutorial_v1'))).toBe('1');
    await page.getByRole('button',{name:'Got it',exact:true}).click();await page.evaluate(()=>window.first);
    // A new device with a class code from the projector QR: lore, then straight to the class goal card.
    await page.evaluate(()=>{window.values=new Map();});
    await frontDoor(page,{session:[['plot_twist_join_v1','harbor']]});
    await page.evaluate(()=>{window.first=window.door.run({loadGame:async()=>window.game});});
    await page.waitForFunction(()=>window.log.some(([name])=>name==='cutscene'));await page.evaluate(()=>window.finishCutscene());
    await page.locator('.goal-card[open]').waitFor();
    expect(await page.locator('.tutorial-card').count()).toBe(0);
    expect(await page.evaluate(()=>window.values.has('plot_twist_tutorial_v1'))).toBe(false);
  });
});
