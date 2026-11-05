import {describe,it,expect} from 'vitest';
import {initialPresenceState,presenceView,tickPresence,reportPosition,setEmote} from '../src/adapter/fake/presence.js';

describe('fake presence state',()=>{
  it('seeds up to thirty opaque peers and reads remain pure until a tick',()=>{
    const state=initialPresenceState({count:30,now:1000}),first=presenceView(state),again=presenceView(state);
    expect(first).toEqual(again);expect(first.others).toHaveLength(30);
    expect(new Set(first.others.map(peer=>peer.id)).size).toBe(30);
    expect(first.others.every(peer=>peer.id&&!peer.name.includes('@')&&peer.kit?.id&&peer.kit?.name)).toBe(true);
    expect(first.sampledAt).toBe(1000);expect(first.localEmote).toBeNull();
    expect(tickPresence(state,1)).toBe(true);expect(presenceView(state).sampledAt).toBe(2000);
    expect(tickPresence(state,0)).toBe(false);
  });
  it('accepts logical positions and limits preset emotes with adapter-supplied cooldown',()=>{
    const state=initialPresenceState({count:0,now:5000});
    expect(reportPosition(state,{place:'saltreach_harbor',x:2.25,y:-4,facing:'left',moving:true}).accepted).toBe(true);
    expect(presenceView(state).place).toBe('saltreach_harbor');
    expect(setEmote(state,'wave').accepted).toBe(true);expect(presenceView(state).localEmote.id).toBe('wave');
    expect(setEmote(state,'wave').reason).toBe('emote_cooldown');expect(setEmote(state,'dance').reason).toBe('invalid_emote');
    tickPresence(state,5);expect(presenceView(state).canEmote).toBe(true);expect(presenceView(state).localEmote).toBeNull();
  });
});
