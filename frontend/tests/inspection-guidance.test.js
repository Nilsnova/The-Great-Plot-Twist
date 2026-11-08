// Earned inspection data stays authoritative while native navigation and report hierarchy guide the player.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
import {inspectionLabel} from '../src/screens/inspection-labels.js';
const evaluate=browserHarness();
const searchView=()=>({search:{activeSpot:null,allowSpotPicker:false,label:'Your satchel',clockLabel:'Case minute 1',
  spots:[{id:'recorded_coast.pier',label:'recorded_coast.pier'},{id:'recorded_coast.desk',label:'Writing desk'}],routes:[],jobs:[]}});

it('formats identifiers while preserving supplied prose, names and punctuation',()=>{
  expect(inspectionLabel('recorded_coast.pier')).toBe('Recorded coast · Pier');
  for(const value of ['Writing desk','Cpt. Drew’s papers.','Supplied full report.','C1'])expect(inspectionLabel(value)).toBe(value);
});

it('lets a native Search page choose only supplied places even when the rehearsal picker is off',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async view=>{
      const {createSearchScreen}=await window.g20Import('/src/screens/search.js');
      const sent=[],screen=createSearchScreen({send:(...args)=>sent.push(args)});screen.update(view);document.body.append(screen.element);
      window.searchProof={screen,sent,view};
    },searchView());
    const picker=page.getByRole('combobox',{name:'Choose a place or item',exact:true});
    expect(await picker.count()).toBe(1);expect(await picker.locator('option').allTextContents())
      .toEqual(['Choose a place or item…','Recorded coast · Pier','Writing desk']);
    expect(await picker.locator('option').first().evaluate(option=>({disabled:option.disabled,html:option.outerHTML})))
      .toEqual({disabled:true,html:expect.stringContaining('disabled')});
    await picker.focus();await picker.selectOption('recorded_coast.pier');
    expect(await page.evaluate(()=>window.searchProof.sent)).toEqual([['inspectSpot','recorded_coast.pier']]);
    await page.evaluate(()=>{const p=window.searchProof;p.view.search.activeSpot='recorded_coast.pier';p.view.search.label='Supplied pier observation.';
      p.view.search.routes=[{id:'recorded-route',title:'Recorded card',label:'Recorded route',price:0,seconds:60,canStart:false,statusText:'Supplied locked status.'}];p.screen.update(p.view);});
    expect(await picker.evaluate(el=>el===document.activeElement)).toBe(true);
    await picker.press('Home');expect(await picker.inputValue()).toBe('recorded_coast.pier');
    expect(await page.getByRole('button',{name:'Start free search · Recorded card',exact:true}).isDisabled()).toBe(true);
    expect(await page.locator('.case-route-status').textContent()).toBe('Supplied locked status.');
  });
});

it('shows a report and Board action only after server completion, including an honest zero-time wait',async()=>{
  const result=await evaluate(async view=>{
    const {createSearchScreen}=await window.g20Import('/src/screens/search.js');const sent=[],navigated=[];
    const screen=createSearchScreen({send:(...args)=>sent.push(args),navigate:name=>navigated.push(name)});
    const job={id:'recorded-job',title:'Recorded search',total:60,remaining:0,done:false,report:'Supplied completed report.'};
    view.search.jobs=[job];screen.update(view);document.body.append(screen.element);
    const root=screen.element,read=()=>({done:root.querySelector('.case-job-state')?.textContent,
      doneHidden:root.querySelector('.case-job-state')?.hidden,report:root.querySelector('.case-job-report').textContent,
      boardHidden:root.querySelector('[data-focus="search-board"]')?.hidden});
    const waiting=read();job.done=true;screen.tick(view);const completed=read();
    root.querySelector('[data-focus="search-board"]')?.click();screen.dispose();return {waiting,completed,sent,navigated};
  },searchView());
  expect(result).toEqual({waiting:{done:'Complete',doneHidden:true,report:'Searching · 0:00',boardHidden:true},
    completed:{done:'Complete',doneHidden:false,report:'Supplied completed report.',boardHidden:false},sent:[],navigated:['board']});
});

it('does not invent a partner location when the server supplies no route chart',async()=>{
  const result=await evaluate(async()=>{
    const {createPartnerLifeScreen}=await window.g20Import('/src/screens/partners/index.js');
    const navigated=[],screen=createPartnerLifeScreen({navigate:name=>navigated.push(name)});screen.update({partners:[{seat:3,name:'Recorded partner',archetype:'deckhand',canOrder:false,orders:[],targets:{},
      job:{report:'Supplied completion.',remaining:0,done:true},life:{status:'idle',chartLine:null}}]});document.body.append(screen.element);
    const board=screen.element.querySelector('[data-focus="partner-board-3"]'),boardVisible=!board.hidden;board.click();
    return {chartHidden:screen.element.querySelector('.partner-chart').hidden,
      report:screen.element.querySelector('.partner-life-report').textContent,text:screen.element.textContent,boardVisible,navigated};
  });
  expect(result.chartHidden).toBe(true);expect(result.report).toBe('Supplied completion.');expect(result.text).not.toContain('At the harbor berth');
  expect(result.boardVisible).toBe(true);expect(result.navigated).toEqual(['board']);
});

it('separates earned log titles and metadata without asking an active player to repeat the intro',async()=>{
  const result=await evaluate(async()=>{
    const {createLogScreen}=await window.g20Import('/src/screens/log/index.js');const screen=createLogScreen();
    screen.update({log:{cards:[{id:'C1',title:'Supplied card title',seat:2,where:'recorded_coast.pier',caseMinute:4}],
      deductions:[],partnerReports:[{name:'Supplied partner',report:'Supplied report.',caseMinute:5}],nights:[],reveal:[]}});
    const title=screen.element.querySelector('.captains-log-entry-title'),meta=screen.element.querySelector('.captains-log-entry-meta');
    return {title:title?.textContent,meta:meta?.textContent,text:screen.element.textContent};
  });
  expect(result.title).toBe('C1 · Supplied card title');expect(result.meta).toBe('Seat 2 · Recorded coast · Pier · Case minute 4');
  expect(result.text).toContain('Supplied report.');expect(result.text).not.toContain('Finish the original intro');
});
