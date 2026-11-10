// Server-envelope errors preserve last-good views rather than creating progress or balances.
import {describe,it,expect} from 'vitest';
import {validReadReply} from '../src/online/adapter/read-shapes.js';

describe('online read envelopes',()=>{
  it('rejects missing account fields and non-numeric balances',()=>{
    const account={id:'private-placeholder',coins:0,crews:[],captainName:null,kit:null,place:null};
    expect(validReadReply('me',account)).toBe(true);
    expect(validReadReply('me',{...account,coins:'1000'})).toBe(false);
    expect(validReadReply('me',{coins:1000})).toBe(false);
  });
  it('accepts a config envelope and refuses the removed crew and save reads',()=>{
    expect(validReadReply('crew',{crew:null})).toBe(false);
    expect(validReadReply('save',{version:1,data:{}})).toBe(false);
    expect(validReadReply('config',{flags:{}})).toBe(true);
    expect(validReadReply('config',{flags:null})).toBe(false);
  });
});
