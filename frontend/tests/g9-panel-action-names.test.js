// Native accessible names keep public context and unchanged action arguments; no transport or outcomes.
import {expect,it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate=browserHarness();

it('names native Stake buttons with their actual question heading while keeping form actions and visible text',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');
      const {buildStakeForm}=await window.g20Import('/src/screens/predictions/stake-form.js');
      const proof={asks:[],confirms:0,backs:0,cards:[]};
      for(const title of ['First recorded question?','Second recorded question?']){
        const id=crypto.randomUUID(),article=document.createElement('article'),heading=document.createElement('h3');
        heading.id=`desk-title-${id}`;heading.textContent=title;article.append(heading);document.body.append(article);
        const form={side:null,amount:'',step:'edit',busy:false};
        const element=buildStakeForm({id,model:{legend:'Your forecast',amountLabel:'Coins (1 to 50)',min:1,max:50,hint:'Play coins.'},form,
          actions:{submit:()=>proof.asks.push({sameQuestion:id===proof.cards[0].id,side:form.side,amount:form.amount}),
            confirm:()=>proof.confirms++,back:()=>proof.backs++}});
        article.append(element);proof.cards.push({id,article,heading,element,form});
      }
      proof.buttons=proof.cards.map(card=>card.element.querySelector('[data-focus="stake"]'));window.actionNameProof=proof;
    });
    const first=page.getByRole('button',{name:'Stake First recorded question?',exact:true});
    const second=page.getByRole('button',{name:'Stake Second recorded question?',exact:true});
    expect(await first.count()).toBe(1);expect(await second.count()).toBe(1);
    expect(await first.textContent()).toBe('Stake');expect(await second.textContent()).toBe('Stake');
    const form=page.locator('article').first();await form.getByRole('radio',{name:'Yes',exact:true}).check();
    await form.getByRole('spinbutton').fill('17');await first.click();
    expect(await page.evaluate(()=>({asks:window.actionNameProof.asks,confirms:window.actionNameProof.confirms,backs:window.actionNameProof.backs})))
      .toEqual({asks:[{sameQuestion:true,side:'yes',amount:'17'}],confirms:0,backs:0});
    await page.evaluate(()=>{window.actionNameProof.cards[0].heading.textContent='Updated first recorded question?';});
    const updated=page.getByRole('button',{name:'Stake Updated first recorded question?',exact:true});
    expect(await updated.count()).toBe(1);expect(await first.count()).toBe(0);
    expect(await updated.evaluate(element=>element===window.actionNameProof.buttons[0]&&element.type==='submit'&&element.dataset.focus==='stake')).toBe(true);
    expect(await page.evaluate(()=>{const p=window.actionNameProof;const names=p.buttons.map(button=>button.getAttribute('aria-labelledby').split(/\s+/)
      .map(id=>document.getElementById(id).textContent).join(' '));
      return {unique:new Set(names).size===names.length,opaque:p.cards.some(card=>names.some(name=>name.includes(card.id)))};}))
      .toEqual({unique:true,opaque:false});
  });
});
