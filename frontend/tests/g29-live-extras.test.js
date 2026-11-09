// G29: the extras bridge between the online presence (which owns Realtime) and the class demo.
import {afterEach,describe,expect,it} from 'vitest';
import {attachExtraSender,canSendExtra,isMe,resolvePeer,sendExtra,setClassHarbor,wantsClassHarbor} from '../src/net/live-extras.js';

let detach=null;
afterEach(()=>{detach?.();detach=null;setClassHarbor(false);});
describe('live extras bridge',()=>{
  it('sends nothing while no presence is attached',()=>{
    expect(canSendExtra()).toBe(false);expect(sendExtra('lamp',{v:1})).toBe(false);expect(resolvePeer('live-captain-1')).toBeNull();expect(isMe('x')).toBe(false);
  });
  it('forwards to the attached sender and maps display ids to player ids',()=>{
    const sent=[];
    detach=attachExtraSender((event,data)=>{sent.push([event,data]);return true;},{resolve:id=>id==='live-captain-1'?'player-1':null,isMe:id=>id==='me'});
    expect(sendExtra('lamp',{v:1})).toBe(true);expect(sent).toEqual([['lamp',{v:1}]]);
    expect(resolvePeer('live-captain-1')).toBe('player-1');expect(resolvePeer('live-captain-9')).toBeNull();
    expect(isMe('me')).toBe(true);expect(isMe('player-1')).toBe(false);
  });
  it('forgets the sender on detach, but an old detach cannot remove a newer sender',()=>{
    const first=attachExtraSender(()=>true);detach=attachExtraSender(()=>true);
    first();expect(canSendExtra()).toBe(true);
    detach();detach=null;expect(canSendExtra()).toBe(false);
  });
  it('survives a sender or resolver that throws',()=>{
    detach=attachExtraSender(()=>{throw new Error('closed');},{resolve(){throw new Error('x');},isMe(){throw new Error('x');}});
    expect(sendExtra('duel',{})).toBe(false);expect(resolvePeer('a')).toBeNull();expect(isMe('a')).toBe(false);
  });
  it('remembers the class harbor choice',()=>{
    expect(wantsClassHarbor()).toBe(false);setClassHarbor(true);expect(wantsClassHarbor()).toBe(true);
  });
});
