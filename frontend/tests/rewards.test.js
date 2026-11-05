// Reward refs, participation and reveal gating belong only to the fake.
import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {creditCard,creditDeduction,settleRewards,rewardsView,solveShare} from '../src/adapter/fake/rewards.js';
const sample=()=>({...initialCaseState(),profile:{kitId:'true_keeper',readLog:true},crew:{seats:[{seat:1,kind:'player',isYou:true,name:'Captain A'},{seat:2,kind:'npc',name:'Partner'}]}});
describe('read-only reward source',()=>{
 it('caps solve shares',()=>{expect(solveShare(0,false)).toBe(400);expect(solveShare(2,true)).toBe(700);expect(solveShare(99,true)).toBe(800);});
 it('credits each card once per player',()=>{const state=sample();creditCard(state,'C1');creditCard(state,'C1');expect(state.coins).toBe(50);expect(rewardsView(state).ledger).toHaveLength(1);});
 it('credits an ordered pin and a deduction only once',()=>{const state=sample(),pins=[{seat:2,orderedBy:1}];creditDeduction(state,'D1',pins);creditDeduction(state,'D1',pins);expect(state.coins).toBe(200);expect(state.rewardState.deductions).toEqual(['D1']);});
 it('does not award a deduction to a spectator',()=>{const state=sample();creditDeduction(state,'D1',[{seat:3},{seat:4}]);expect(state.coins).toBe(0);});
 it('freezes human contributors, never NPCs, and rewards the solve once',()=>{const state=sample();state.pins=[{seat:2,orderedBy:1}];state.solved=true;settleRewards(state);const coins=state.coins;settleRewards(state);expect(coins).toBe(400);expect(state.coins).toBe(coins);expect(rewardsView(state).contributors).toEqual([1]);expect(state.wall).toEqual([{name:'Captain A',order:1}]);});
 it('counts only locks that actually parted fog and an accepted accuser',()=>{const state=sample();state.night={locks:[{seat:2,aimedBy:1}]};settleRewards(state);expect(state.rewardState.finaleRole).toBeUndefined();state.schooner=true;settleRewards(state);expect(state.rewardState.finaleRole).toBe(true);state.solved=true;settleRewards(state);expect(state.coins).toBe(500);const accuser=sample();settleRewards(accuser);accuser.rewardState.accusedBy=1;accuser.solved=true;settleRewards(accuser);expect(accuser.coins).toBe(500);});
 it('hides epilogue and earned keepsakes until the reveal ends',()=>{const state=sample();state.solved=true;settleRewards(state);expect(rewardsView(state).epilogue).toEqual([]);state.revealIndex=9;expect(rewardsView(state).epilogue).toHaveLength(2);expect(rewardsView(state).keepsakes.every(item=>item.owned)).toBe(true);});
});
