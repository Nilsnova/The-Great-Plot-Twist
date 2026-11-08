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

it('keeps challenge action names distinct and stable for repeated public names without changing answer or decline ownership',async()=>{
  await evaluate.withPage(async page=>{
    await page.evaluate(async()=>{
      await window.g20Import('/src/ui/base.css');await window.g20Import('/src/ui/kit/kit.css');await window.g20Import('/src/screens/duels/duels.css');
      const {createChallenges}=await window.g20Import('/src/screens/duels/challenges.js');
      const make=()=>({id:crypto.randomUUID(),challengerName:'Recorded Captain',rounds:3,stake:0,cutPercent:5,winnerTakes:0,
        expiresAt:new Date(Date.now()+3600000).toISOString(),canAnswer:true,canDecline:true});
      const first=make(),second=make(),open={...make(),isOpen:true,canDecline:false};
      const proof={first,second,open,make,answers:[],declines:[]};
      const component=createChallenges({onAnswer:async(id,signals)=>proof.answers.push({sameId:id===second.id,signals}),
        onDecline:id=>proof.declines.push(id===first.id)});
      const view={coins:120,serverOffsetMs:0,incoming:[first,second],openChallenges:[open]};
      document.body.append(component.element);component.update(view);Object.assign(proof,{component,view});window.challengeNameProof=proof;
    });
    const answer2=page.getByRole('button',{name:'Answer challenge 2 from Recorded Captain',exact:true});
    expect(await page.getByRole('button',{name:'Answer challenge 1 from Recorded Captain',exact:true}).textContent()).toBe('Answer');
    expect(await page.getByRole('button',{name:'Answer challenge 3 from Recorded Captain',exact:true}).count()).toBe(1);
    expect(await page.getByRole('button',{name:'Decline challenge 1 from Recorded Captain',exact:true}).textContent()).toBe('Decline');
    await answer2.focus();
    const stable=await page.evaluate(()=>{const p=window.challengeNameProof,root=p.component.element;
      const nameOf=duel=>root.querySelector(`[data-focus="answer-${duel.id}"]`).getAttribute('aria-label');
      const before=[p.first,p.second,p.open].map(nameOf),extra=p.make();p.view.incoming=[p.second,p.first,extra];p.component.update(p.view);
      const after=[p.first,p.second,p.open].map(nameOf),buttons=[...root.querySelectorAll('button')].filter(button=>!button.closest('[hidden]'));
      const names=buttons.map(button=>button.getAttribute('aria-label')??button.textContent);
      return {stable:before.every((name,index)=>name===after[index]),focused:document.activeElement.getAttribute('aria-label')===before[1],
        unique:new Set(names).size===names.length,opaque:[p.first,p.second,p.open,extra].some(duel=>names.some(name=>name.includes(duel.id))),
        added:nameOf(extra)};});
    expect(stable).toEqual({stable:true,focused:true,unique:true,opaque:false,added:'Answer challenge 4 from Recorded Captain'});
    await answer2.click();const answer=page.locator('.duel-answer:not([hidden])'),rounds=answer.locator('.duel-round');
    expect(await rounds.count()).toBe(3);
    for(let index=0;index<3;index++)await rounds.nth(index).locator('input[type="radio"][value="shade"]').check();
    await answer.getByRole('button',{name:'Seal and answer',exact:true}).click();await answer.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Decline challenge 1 from Recorded Captain',exact:true}).click();
    const result=await page.evaluate(()=>{const p=window.challengeNameProof,retained=p.component.element.querySelector(`[data-focus="answer-${p.second.id}"]`);
      p.component.dispose();retained.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return {answers:p.answers,declines:p.declines,empty:p.component.element.children.length===0,removed:!p.component.element.isConnected};});
    expect(result).toEqual({answers:[{sameId:true,signals:['shade','shade','shade']}],declines:[true],empty:true,removed:true});
  });
});
