// Native Settings DOM renders public metadata as text without bringing credits into gameplay.
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';

const evaluate=browserHarness();

it('renders exact server credit and licence text safely, without another request, after ordinary close',async()=>{
  const result=await evaluate(async()=>{
    // This isolated DOM fixture supplies the constant normally inserted by the app build.
    window.__BUILD_STAMP__={sha:'dev',builtAt:'2026-11-06T00:00:00.000Z'};
    const [{credits},{createMarketPolicy},{createSession},{registerPanelServices}]=await Promise.all([
      window.g20Import('/src/shell/credits.js'),window.g20Import('/src/online/market-policy.js'),
      window.g20Import('/src/online/session.js'),window.g20Import('/src/online/panel-services.js'),
    ]);
    const session=createSession(),exact='Exact <img src=x onerror="window.__creditExecuted=true"> source';
    const licence='Server licence <script>window.__creditExecuted=true</script>';
    let publicReads=0,privateReads=0;
    const api={get:async()=>{privateReads+=1;return {ok:false};}};
    const publicApi={get:async()=>{publicReads+=1;return {ok:true,status:200,data:{credits:[
      {text:exact,href:'https://example.invalid/recorded-source',licenceText:licence,
        licenceHref:'https://example.invalid/exact-licence'},
      {text:'Unsafe source remains text',href:'javascript:window.__creditExecuted=true',
        licenceText:'Unsafe licence remains text',licenceHref:'http://example.invalid/licence'},
    ]}};}};
    const lease=registerPanelServices(session,{api,publicApi,getFlags:()=>({market:false}),isReady:()=>true});
    const policy=createMarketPolicy(lease);
    try{
      await policy.publicGet('/api/market');policy.dispose();
      document.body.replaceChildren(credits({session}));
      const rows=[...document.querySelectorAll('.shell-credits .shell-market-credit')];
      const links=[...rows[0].querySelectorAll('a')];
      const initial={rows:rows.length,text:rows[0].textContent,plain:rows[1].textContent,
        injected:rows.reduce((sum,row)=>sum+row.querySelectorAll('img,script').length,0),
        executed:window.__creditExecuted===true,unsafeAnchors:rows[1].querySelectorAll('a').length,
        links:links.map(link=>({text:link.textContent,href:link.getAttribute('href'),target:link.target,rel:link.rel})),
        staticText:document.querySelector('.shell-credits').textContent,publicReads,privateReads};
      lease.dispose();document.body.replaceChildren(credits({session}));
      return {...initial,afterDispose:document.querySelectorAll('.shell-market-credit').length};
    }finally{policy.dispose();lease.dispose();}
  });
  expect(result.rows).toBe(2);
  expect(result.text).toBe('Exact <img src=x onerror="window.__creditExecuted=true"> source Server licence <script>window.__creditExecuted=true</script>');
  expect(result.plain).toBe('Unsafe source remains text Unsafe licence remains text');
  expect(result.injected).toBe(0);expect(result.executed).toBe(false);expect(result.unsafeAnchors).toBe(0);
  expect(result.links).toEqual([
    {text:'Exact <img src=x onerror="window.__creditExecuted=true"> source',href:'https://example.invalid/recorded-source',target:'_blank',rel:'noopener noreferrer'},
    {text:'Server licence <script>window.__creditExecuted=true</script>',href:'https://example.invalid/exact-licence',target:'_blank',rel:'noopener noreferrer'},
  ]);
  expect(result.publicReads).toBe(1);expect(result.privateReads).toBe(0);expect(result.afterDispose).toBe(0);
  for(const retained of ['Nils Lenke','Weather data by Open-Meteo.com','Binance public market data',
    'Football-Data.org API','Supabase JavaScript client and components: MIT'])expect(result.staticText).toContain(retained);
  expect(result.staticText).not.toContain('Manifold'); // no prediction market in the game (D035)
});

it('selects the default or injected session without falling back to another registered owner',async()=>{
  expect(await evaluate(async()=>{
    window.__BUILD_STAMP__={sha:'dev',builtAt:'2026-11-06T00:00:00.000Z'};
    const [{credits},{createMarketPolicy},{createSession,session:defaultSession},{registerPanelServices}]=await Promise.all([
      window.g20Import('/src/shell/credits.js'),window.g20Import('/src/online/market-policy.js'),
      window.g20Import('/src/online/session.js'),window.g20Import('/src/online/panel-services.js'),
    ]);
    const owner=defaultSession,other=createSession();
    const lease=registerPanelServices(owner,{api:{},isReady:()=>true,getFlags:()=>({market:true}),
      publicApi:{get:async()=>({ok:true,data:{credits:[{text:'Only the owner lease source'}]}})}});
    const policy=createMarketPolicy(lease);
    try{
      await policy.publicGet('/api/market');
      document.body.replaceChildren(credits({session:other}));
      const otherRows=document.querySelectorAll('.shell-market-credit').length;
      document.body.replaceChildren(credits());
      return {otherRows,ownerText:document.querySelector('.shell-market-credit')?.textContent};
    }finally{policy.dispose();lease.dispose();}
  })).toEqual({otherRows:0,ownerText:'Only the owner lease source'});
});

it('keeps the server-credit reader in the lazy Settings branch and outside both market panes',async()=>{
  const [subpages,shell,board,positions]=await Promise.all([
    readFile('src/shell/subpages.js','utf8'),readFile('src/shell/credits.js','utf8'),
    readFile('src/screens/market/board-view.js','utf8'),readFile('src/screens/market/positions-view.js','utf8'),
  ]);
  expect(subpages).toMatch(/mode==='credits'[\s\S]*?await import\('\.\/credits\.js'\)/);
  expect(subpages).toContain("menuButton('Credits',()=>show('credits'),true)");
  expect(shell).toContain('readMarketCredits(session)');
  for(const pane of [board,positions])expect(pane).not.toMatch(/readMarketCredits|shell-market-credit|market-credits/);
});
