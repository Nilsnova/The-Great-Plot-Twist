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
    for(const [width,height] of [[375,812],[390,844],[360,640],[1280,720],[812,375]]){
      await page.setViewportSize({width,height});
      results[`${width}x${height}`]=await page.evaluate(()=>{
        const card=document.querySelector('.shell-screen[data-mode=title]').getBoundingClientRect();
        return {top:Math.round(card.top),gapBelow:Math.round(innerHeight-card.bottom),inside:card.top>=0&&card.bottom<=innerHeight&&card.left>=0&&card.right<=innerWidth,
          playVisible:!!document.querySelector('#play')?.getClientRects().length,scroll:document.documentElement.scrollWidth>innerWidth};
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
    await page.evaluate(()=>window.titleShell.dispose());
  });
});
