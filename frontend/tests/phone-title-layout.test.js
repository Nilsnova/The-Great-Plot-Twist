// On tall phones the title card sits at the bottom, so the lighthouse island above it stays visible.
// Laptops and phones on their side keep the card where it was.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('puts the title card at the bottom on tall phones and leaves laptops and landscape alone',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      for(const sheet of ['/src/ui/base.css','/src/ui/kit/kit.css','/src/ui/styles.css','/src/ui/shell.css'])await window.g20Import(sheet);
      const {createShell}=await window.g20Import('/src/shell/controller.js');
      window.titleShell=createShell({container:document.body,readAccount:()=>({state:'signed_out',canSignIn:false}),resetInput(){},onState(){},focus(){},hasOverlay:()=>false});
    });
    const results={};
    for(const [width,height] of [[320,568],[375,812],[390,844],[360,640],[568,320],[1280,720],[812,375]]){
      await page.setViewportSize({width,height});
      results[`${width}x${height}`]=await page.evaluate(()=>{
        const title=document.querySelector('.shell-screen[data-mode=title]'),card=title.getBoundingClientRect();
        const buttons=[...title.querySelectorAll('.shell-menu button, .shell-more')].map(button=>{
          const rect=button.getBoundingClientRect();
          return {height:rect.height, hit:button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))};
        });
        return {top:Math.round(card.top),gapBelow:Math.round(innerHeight-card.bottom),inside:card.top>=0&&card.bottom<=innerHeight&&card.left>=0&&card.right<=innerWidth,
          right:card.right, internalScroll:title.scrollHeight>title.clientHeight,
          playVisible:!!document.querySelector('#play')?.getClientRects().length,scroll:document.documentElement.scrollWidth>innerWidth,buttons};
      });
    }
    for(const [size,box] of Object.entries(results))expect(box,size).toMatchObject({inside:true,playVisible:true,scroll:false});
    // Tall phones: the card hugs the bottom edge, and the top 40 % of the screen (the island) is free.
    for(const size of ['375x812','390x844','360x640']){
      const height=Number(size.split('x')[1]);
      expect(results[size].gapBelow,size).toBeLessThanOrEqual(20);
      expect(results[size].top,size).toBeGreaterThanOrEqual(Math.round(height*.3));
    }
    // A laptop and a phone on its side: the card is not pushed to the bottom.
    expect(results['1280x720'].gapBelow).toBeGreaterThan(40);
    expect(results['812x375'].gapBelow).toBeGreaterThan(20);
    const short=results['320x568'],landscape=results['568x320'];
    expect(short.top).toBeGreaterThanOrEqual(270);
    expect(landscape.right).toBeLessThan(320);
    for(const compact of [short,landscape]){
      expect(compact.internalScroll).toBe(false);
      expect(compact.buttons).toHaveLength(3);
      expect(compact.buttons.every(button=>button.height>=44&&button.hit)).toBe(true);
    }
    await page.evaluate(()=>window.titleShell.dispose());
  });
});

it('follows the title motion preference and resumes after a device change',async()=>{
  await evaluate.withPage(async page=>{
    await page.setViewportSize({width:320,height:568});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      const {startAnimatedTitle}=await window.g20Import('/src/title/animated-title.js');
      const {setPreferences}=await window.g20Import('/src/settings/preferences.js');
      const backdrop=document.createElement('div');document.body.append(backdrop);
      window.titleScene=await startAnimatedTitle({backdrop});
      window.titleMotion=setPreferences;
    });
    const capture=()=>page.evaluate(()=>window.titleScene.canvas.toDataURL());
    await page.locator('.title-scene-ready.title-scene-still').waitFor();
    const deviceStill=await capture();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(image=>window.titleScene.canvas.toDataURL()!==image,deviceStill);
    await page.evaluate(()=>window.titleMotion({reducedMotion:true}));
    await page.locator('.title-scene-still').waitFor();
    expect(await capture()).toBe(deviceStill);
    await page.evaluate(()=>window.titleMotion({reducedMotion:false}));
    await page.waitForFunction(image=>window.titleScene.canvas.toDataURL()!==image,deviceStill);
    await page.evaluate(()=>window.titleScene.dispose());
  });
});
