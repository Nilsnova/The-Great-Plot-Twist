// Draft fake board authority: ownership, distinct seats, gates and refusal integrity.
import {describe,it,expect} from 'vitest';
import {initialCaseState} from '../src/adapter/fake/state.js';
import {pinCard,pairCards,cardOpen,boardView} from '../src/adapter/fake/board.js';
function state(){const s=initialCaseState();s.crew={status:'active',seats:[{seat:1,kind:'player',isYou:true},{seat:2,kind:'npc'}]};s.found[1]=['C1','C2','C3','C5','C7'];s.found[2]=['C2','C4','C6','C8'];return s;}
describe('fake board rules',()=>{
  it('needs two different pinning seats, including an NPC seat',()=>{const s=state();pinCard(s,'C1',1);pinCard(s,'C2',1);const coins=s.coins;expect(pairCards(s,'C1','C2').reason).toBe('different_seats_required');expect(s.coins).toBe(coins);expect(s.deductions).toEqual([]);pinCard(s,'C2',2);expect(pairCards(s,'C1','C2').accepted).toBe(true);expect(s.deductions).toEqual(['D1']);});
  it('opens C5/C6 after D2 and C8 only after D3',()=>{const s=state();expect(cardOpen(s,'C5')).toBe(false);expect(cardOpen(s,'C6')).toBe(false);expect(cardOpen(s,'C8')).toBe(false);for(const [id,seat] of [['C3',1],['C4',2]])pinCard(s,id,seat);pairCards(s,'C3','C4');expect(cardOpen(s,'C5')&&cardOpen(s,'C6')).toBe(true);expect(cardOpen(s,'C8')).toBe(false);pinCard(s,'C5',1);pinCard(s,'C6',2);pairCards(s,'C5','C6');expect(cardOpen(s,'C8')).toBe(true);});
  it('refuses unheld pins and repeated rewards',()=>{const s=state();expect(pinCard(s,'C8',1).accepted).toBe(false);pinCard(s,'C1',1);const coins=s.coins;expect(pinCard(s,'C1',1).reason).toBe('already_pinned');expect(s.coins).toBe(coins);});
  it('supplies findings, clearances and every seat credit in its view',()=>{const s=state();pinCard(s,'C3',1);pinCard(s,'C4',2);pairCards(s,'C3','C4');const v=boardView(s);expect(v.suspects.find(s=>s.id==='fisherman').clearedBy).toBe('D2');expect(v.cards.find(c=>c.id==='C4').pinnedBy[0].seat).toBe(2);expect(v.deductions.find(d=>d.id==='D2').finding).toBe('[finding supplied by the server]');});
  it('wrong pairs only start their declared cooldown, without spending coins or changing cards',()=>{const s=state();pinCard(s,'C1',1);pinCard(s,'C4',2);const before=structuredClone({coins:s.coins,found:s.found,pins:s.pins});expect(pairCards(s,'C1','C4').reason).toBe('wrong_pair');expect({coins:s.coins,found:s.found,pins:s.pins}).toEqual(before);expect(s.pairWaitUntil).toBe(30);});
});
