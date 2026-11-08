// Native board controls survive clock/live snapshots; display clocks do not invent a revision.
import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {browserHarness} from './g20-browser.js';
import {createCaseFixture} from '../scripts/online-case-fixture.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createSession} from '../src/online/session.js';

const native=browserHarness();
const boardRecord=()=>({revision:1,presence:{status:'live',others:[],hiddenCount:0},board:{
  pairHelp:'Recorded pair instructions.',pairWait:0,canPair:true,leads:[],logLead:null,pinHighlights:[],
  cards:['C1','C2','C3'].map(id=>({id,title:`Recorded card ${id}`,body:`Recorded private text ${id}.`,
    state:'new',holders:[{seat:1,label:'Recorded captain'}],pinnedBy:[],canPin:true,canPair:true})),
  deductions:[{id:'D1',title:'Recorded deduction',complete:false,finding:null,clearedTitles:[],opens:[]}],
  suspects:[{id:'recorded_suspect',title:'Recorded suspect',cleared:false,clearedBy:null}],
}});

it('retains the exact native pair controls, selections and focus through clock and unrelated live updates',async()=>{
  await native.withPage(async page=>{
    await page.evaluate(async view=>{
      const {createBoardScreen}=await window.g20Import('/src/screens/board.js');
      const sent=[],screen=createBoardScreen({send:(...args)=>sent.push(args)});
      screen.update(view);document.body.append(screen.element);
      window.boardProof={screen,view,sent};
    },boardRecord());
    await page.locator('[data-focus="pair-first"]').selectOption('C3');
    await page.locator('[data-focus="pair-second"]').selectOption('C1');
    await page.getByRole('button',{name:'Pair cards',exact:true}).focus();
    const stable=await page.evaluate(()=>{
      const proof=window.boardProof,root=proof.screen.element;
      const controls=[...root.querySelectorAll('select,button')],cards=[...root.querySelectorAll('.case-clue')];
      const first=root.querySelector('[data-focus="pair-first"]'),second=root.querySelector('[data-focus="pair-second"]');
      const pair=document.activeElement,wait=root.querySelector('.case-pair-wait');
      let retained=true;
      for(let step=1;step<=8;step++){
        const next=structuredClone(proof.view);next.revision+=step;
        next.presence.others=[{id:'recorded-peer',x:step,z:-step}];next.presence.hiddenCount=step;
        next.board.pairWait=9-step;proof.screen.update(next);
        retained=retained&&controls.every((node,index)=>root.querySelectorAll('select,button')[index]===node)
          &&cards.every((node,index)=>root.querySelectorAll('.case-clue')[index]===node)
          &&root.querySelector('.case-pair-wait')===wait&&document.activeElement===pair
          &&first.value==='C3'&&second.value==='C1';
        proof.view=next;
      }
      return {retained,controls:controls.length,selected:[first.value,second.value],
        focus:document.activeElement===pair,pairEnabled:!pair.disabled,wait:wait.textContent,sent:proof.sent};
    });
    expect(stable).toEqual({retained:true,controls:6,selected:['C3','C1'],focus:true,
      pairEnabled:true,wait:'Pairing available in 0:01',sent:[]});
    await page.getByRole('button',{name:'Pair cards',exact:true}).click();
    expect(await page.evaluate(()=>window.boardProof.sent)).toEqual([['pair','C3','C1']]);

    await page.evaluate(()=>{
      const proof=window.boardProof;proof.view.board.canPair=false;proof.screen.update(proof.view);
    });
    expect(await page.getByRole('button',{name:'Pair cards',exact:true}).isDisabled()).toBe(true);
    expect(await page.locator('[data-focus="pair-first"]').inputValue()).toBe('C3');
    expect(await page.locator('[data-focus="pair-second"]').inputValue()).toBe('C1');

    await page.evaluate(()=>{
      const proof=window.boardProof;proof.view.board.canPair=true;
      proof.view.board.cards[2].title='Updated recorded card';proof.view.board.cards[2].body='Updated private card text.';
      proof.screen.update(proof.view);
    });
    expect(await page.locator('[data-card="C3"] h3').textContent()).toBe('Updated recorded card');
    expect(await page.locator('[data-card="C3"]').textContent()).toContain('Updated private card text.');
    expect(await page.getByRole('button',{name:'Pair cards',exact:true}).isEnabled()).toBe(true);
    expect(await page.locator('[data-focus="pair-first"]').inputValue()).toBe('C3');

    const cleared=await page.evaluate(()=>{
      const proof=window.boardProof,oldCards=[...proof.screen.element.querySelectorAll('.case-clue')];
      proof.view.board={cards:[],deductions:[],suspects:[],leads:[],canPair:false,pairWait:0};
      proof.screen.update(proof.view);
      const root=proof.screen.element;
      const result={oldDetached:oldCards.every(card=>!card.isConnected),cards:root.querySelectorAll('.case-clue').length,
        controls:root.querySelectorAll('select,button').length,text:root.textContent};
      proof.screen.dispose();return result;
    });
    expect(cleared.oldDetached).toBe(true);expect(cleared.cards).toBe(0);expect(cleared.controls).toBe(0);
    expect(cleared.text).toContain('No cards yet.');
    for(const privateText of ['Updated recorded card','Updated private card text.','Recorded private text',
      'Recorded captain','Recorded deduction','Recorded suspect'])expect(cleared.text).not.toContain(privateText);
  });
});

it('publishes fresh display clocks with the same revision and event while retaining authoritative outcomes',()=>{
  const session=createSession();session.setToken(`runtime-${randomUUID()}`);
  const snapshot=createCaseFixture({progress:{search:'working',night:'night'}});snapshot.board.pairWait=10;
  const store=createAdapterStore({session}),events=[];
  try{
    store.commit({config:{flags:{case:true}},me:{coins:0},case:snapshot,caseLoaded:true,caseElapsed:0});
    const before=store.read(),stop=store.subscribe(event=>events.push(event));
    store.commit({caseElapsed:3},{advanceRevision:false});
    const updated=store.read();
    expect(events).toHaveLength(1);expect(events[0].type).toBe('case_updated');
    expect(events[0].view).toEqual(updated);expect(updated.revision).toBe(before.revision);
    expect(store.state.revision).toBe(before.revision);expect(updated.now).toBe(snapshot.now+3);
    expect(updated.board.pairWait).toBe(7);expect(updated.finale.remaining).toBe(57);
    expect(updated.search.jobs[0].remaining).toBe(0);expect(updated.search.jobs[0].done).toBe(false);
    expect(updated.board.canPair).toBe(before.board.canPair);expect(store.state.case).toEqual(snapshot);
    events[0].view.board.cards[0].title='Listener-only mutation';
    expect(store.read().board.cards[0].title).toBe(before.board.cards[0].title);
    store.commit({caseElapsed:4});
    expect(events).toHaveLength(2);expect(events[1].type).toBe('case_updated');
    expect(events[1].view.revision).toBe(before.revision+1);expect(events[1].view.now).toBe(snapshot.now+4);
    stop();
  }finally{store.dispose();session.clearToken();}
});

it('announces a board cooldown and readiness once while the visible timer keeps counting',async()=>{
  const result=await native(async view=>{
    const {createBoardScreen}=await window.g20Import('/src/screens/board.js');
    const screen=createBoardScreen({send(){throw Error('Display clocks must not send intents');}});
    screen.update(view);document.body.append(screen.element);
    const announcement=screen.element.querySelector('[role="status"]');
    const changes=[],observer=new MutationObserver(()=>changes.push(announcement.textContent));
    observer.observe(announcement,{childList:true,subtree:true,characterData:true});
    const draw=async(wait,canPair)=>{view.board.pairWait=wait;view.board.canPair=canPair;
      screen.update(view);await Promise.resolve();};
    await draw(3,false);await draw(2,false);await draw(1,false);await draw(1,false);
    const during={changes:[...changes],text:screen.element.querySelector('.case-pair-wait').textContent,
      live:screen.element.querySelector('.case-pair-wait').getAttribute('aria-live'),
      sameNode:announcement===screen.element.querySelector('[role="status"]')};
    await draw(0,true);await draw(0,true);
    const ready={changes:[...changes],text:announcement.textContent};
    view.board.cards=[];await draw(0,false);
    const cleared=announcement.textContent;observer.disconnect();screen.dispose();return {during,ready,cleared};
  },boardRecord());
  expect(result).toEqual({during:{changes:['Pairing available in 0:03.'],text:'Pairing available in 0:01',live:'off',sameNode:true},
    ready:{changes:['Pairing available in 0:03.','You can pair cards again.'],text:'You can pair cards again.'},cleared:''});
});

it('keeps native search progress and its percentage in sync without inventing job completion',async()=>{
  const result=await native(async()=>{
    const {createSearchScreen}=await window.g20Import('/src/screens/search.js');
    const sent=[],screen=createSearchScreen({send:(...args)=>sent.push(args)});
    const job={id:'recorded-search',title:'Recorded search',total:60,remaining:45,done:false,
      report:'Server-confirmed recorded finding.'};
    const view={search:{clockLabel:'Case minute 1',label:'Recorded satchel',allowSpotPicker:false,
      spots:[],routes:[],jobs:[job]}};
    screen.update(view);document.body.append(screen.element);
    const row=screen.element.querySelector('.case-job'),bar=row.querySelector('progress');
    const percent=row.querySelector('.kit-progress-value'),report=row.querySelector('.case-job-report');
    const read=()=>({value:bar.value,max:bar.max,percent:percent.textContent,report:report.textContent,
      done:job.done,sameBar:row.querySelector('progress')===bar,samePercent:row.querySelector('.kit-progress-value')===percent});
    const initial=read();job.remaining=30;screen.tick(view);const halfway=read();
    job.remaining=0;screen.tick(view);const clockFinished=read();
    job.done=true;screen.tick(view);const confirmed=read();
    screen.dispose();return {initial,halfway,clockFinished,confirmed,sent,removed:!screen.element.isConnected};
  });
  expect(result).toEqual({
    initial:{value:.25,max:1,percent:'25%',report:'Searching · 0:45',done:false,sameBar:true,samePercent:true},
    halfway:{value:.5,max:1,percent:'50%',report:'Searching · 0:30',done:false,sameBar:true,samePercent:true},
    clockFinished:{value:1,max:1,percent:'100%',report:'Searching · 0:00',done:false,sameBar:true,samePercent:true},
    confirmed:{value:1,max:1,percent:'100%',report:'Server-confirmed recorded finding.',done:true,sameBar:true,samePercent:true},
    sent:[],removed:true,
  });
});
