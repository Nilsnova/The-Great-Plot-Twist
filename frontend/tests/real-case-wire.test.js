// The published request/envelope protocol only; no nested DTO, story data, HTTP or account fixture.
import {describe, expect, it} from 'vitest';
import {buildCaseRequest, parseCaseIntentAnswer} from '../src/online/case-adapter/case-wire.js';
import {createUidFactory} from '../src/online/case-adapter/uid.js';

const makeUid = createUidFactory({now: () => 1234, random: () => .5});
const examples = [
  ['pin', '/api/board/pin', {cardId: 'C1'}],
  ['pair', '/api/board/pair', {cards: ['C2', 'C8']}],
  ['search', '/api/case/search', {routeId: 'C1.recorded_route', paidConfirmed: false, expectedPrice: null}],
  ['orderPartner', '/api/crews/me/orders', {seat: 4, order: 'fetch', target: 'C1', allowPaid: false}],
  ['callNightfall', '/api/finale/nightfall', {}],
  ['takePost', '/api/finale/post', {light: 'recorded_light'}],
  ['aim', '/api/finale/signal', {light: 'recorded_light', bearing: 45}],
  ['accuse', '/api/case/accuse', {suspect: 'recorded_suspect'}],
];

describe('published case request boundary', () => {
  it.each(examples)('builds the exact %s body with the unchanged caller-owned UID', (intent, route, fields) => {
    const actionUid = makeUid(), input = {...fields, actionUid}, before = structuredClone(input);
    const first = buildCaseRequest(intent, input), repeat = buildCaseRequest(intent, input);
    expect(first).toEqual({method: 'POST', route, body: before}); expect(repeat).toEqual(first);
    expect(first.body.actionUid).toBe(actionUid); expect(first.body).not.toBe(input); expect(input).toEqual(before);
    if (Array.isArray(input.cards)) {expect(first.body.cards).not.toBe(input.cards); expect(first.body.cards).toEqual(input.cards);}
  });

  it.each(examples)('rejects unknown and missing %s fields without making a replacement UID', (intent, _route, fields) => {
    const body = {...fields, actionUid: makeUid()};
    expect(buildCaseRequest(intent, {...body, playerId: 'Recorded forbidden field'})).toBeNull();
    expect(buildCaseRequest(intent, {...body, [Symbol('extra')]: true})).toBeNull();
    for (const key of Object.keys(body)) {const missing = {...body}; delete missing[key]; expect(buildCaseRequest(intent, missing)).toBeNull();}
    for (const actionUid of ['', 'short', 'a'.repeat(65), 'space uid', 'unicode_α', 'valid_uid\n', 'valid_uid\r', 'valid_uid\u2028', 'valid_uid\u2029']) {
      expect(buildCaseRequest(intent, {...body, actionUid})).toBeNull();
    }
  });

  it('keeps valid server IDs intact and sends explicit integer search price and consent', () => {
    const actionUid = makeUid();
    for (const expectedPrice of [null, 0, 7, Number.MAX_SAFE_INTEGER]) {
      const input = {routeId: 'C1.recorded_route', paidConfirmed: true, expectedPrice, actionUid};
      expect(buildCaseRequest('search', input)?.body).toEqual(input);
    }
    for (const paidConfirmed of [null, 0, 'true']) expect(buildCaseRequest('search', {routeId: 'C1.recorded_route', paidConfirmed, expectedPrice: null, actionUid})).toBeNull();
    for (const expectedPrice of [undefined, '7', {}, NaN, Infinity, -1, 7.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(buildCaseRequest('search', {routeId: 'C1.recorded_route', paidConfirmed: false, expectedPrice, actionUid})).toBeNull();
    }
    expect(buildCaseRequest('orderPartner', {seat: 1, order: 'man_light', target: 'recorded_light', allowPaid: false, actionUid})?.body.order).toBe('man_light');
    for (const order of ['search', 'pin', 'wait']) expect(buildCaseRequest('orderPartner', {seat: 1, order, target: 'C1', allowPaid: false, actionUid})).toBeNull();
    for (const seat of [0, 5, 1.5, '1']) expect(buildCaseRequest('orderPartner', {seat, order: 'fetch', target: 'C1', allowPaid: false, actionUid})).toBeNull();
    for (const allowPaid of [true, undefined, 0]) expect(buildCaseRequest('orderPartner', {seat: 1, order: 'fetch', target: 'C1', allowPaid, actionUid})).toBeNull();
  });

  it.each([
    ['search', 'routeId', {paidConfirmed: false, expectedPrice: null},
      ['C1.aa', 'C8.' + 'a'.repeat(40)], ['', 'C0.aa', 'C9.aa', 'c1.aa', 'C1.a', 'C1.' + 'a'.repeat(41), 'C1.AA', 'C1.two-words', 'C1.αα', 'C1.aa\n', 'C1.aa\u2028']],
    ['orderPartner', 'target', {seat: 1, order: 'fetch', allowPaid: false},
      ['C1', 'a' + '0'.repeat(63)], ['', 'a', '1a', 'a' + '0'.repeat(64), 'a-b', 'a b', 'αa', 'C1\n']],
    ['takePost', 'light', {},
      ['a1', 'a' + '_'.repeat(60)], ['', 'a', '1a', 'Aa', 'a' + '_'.repeat(61), 'a-b', 'a b', 'αa', 'a1\n']],
    ['aim', 'light', {bearing: 45},
      ['a1', 'a' + '_'.repeat(60)], ['', 'a', '1a', 'Aa', 'a' + '_'.repeat(61), 'a-b', 'a b', 'αa', 'a1\n']],
    ['accuse', 'suspect', {},
      ['aa', '0_','a'.repeat(40)], ['', 'a', 'a'.repeat(41), 'AA', 'a-b', 'a b', 'αa', 'aa\n']],
  ])('enforces the adopted main %s ID schema without rewriting it', (intent, field, extra, valid, invalid) => {
    const actionUid = makeUid();
    for (const id of valid) {
      const input = {...extra, [field]: id, actionUid};
      expect(buildCaseRequest(intent, input)?.body).toEqual(input);
    }
    for (const id of [...invalid, null, undefined, 1, {}]) {
      expect(buildCaseRequest(intent, {...extra, [field]: id, actionUid})).toBeNull();
    }
  });

  it('enforces only the published card catalogue and normalizes finite bearings without mutating a draft', () => {
    const actionUid = makeUid();
    for (const cardId of ['C0', 'C9', 'c1', 'C1\n', 'C1\u2028', 1]) expect(buildCaseRequest('pin', {cardId, actionUid})).toBeNull();
    for (const cards of [['C1', 'C1'], ['C1'], ['C1', 'C2', 'C3'], ['C1', 'C9']]) expect(buildCaseRequest('pair', {cards, actionUid})).toBeNull();
    const sparse = ['C1']; sparse.length = 2; expect(buildCaseRequest('pair', {cards: sparse, actionUid})).toBeNull();
    for (const [bearing, expected] of [[-90, 270], [360, 0], [725.5, 5.5], [-0, 0]]) {
      const input = {light: 'recorded_light', bearing, actionUid}; expect(buildCaseRequest('aim', input)?.body.bearing).toBe(expected); expect(input.bearing).toBe(bearing);
    }
    for (const bearing of [NaN, Infinity, '90', null]) expect(buildCaseRequest('aim', {light: 'recorded', bearing, actionUid})).toBeNull();
    for (const intent of ['buildLight', 'inspectSpot', 'boardSchooner', 'nextReveal', 'claimLantern', 'hostClock', '__proto__']) {
      expect(buildCaseRequest(intent, {actionUid})).toBeNull();
    }
  });
});

describe('outer case intent envelope only', () => {
  it('preserves an original repeated refusal and passes its opaque payload/extras through without inspecting them', () => {
    const opaque = new Proxy({}, {get() {throw new Error('Nested case inspection is forbidden in this leaf.');}});
    const answer = {accepted: false, reason: 'accusation_refused', message: 'Recorded refusal.', repeat: true,
      case: opaque, seconds: 60, extra: {recorded: true}};
    const parsed = parseCaseIntentAnswer(answer);
    expect(parsed !== answer).toBe(true); expect(parsed.accepted).toBe(false); expect(parsed.repeat).toBe(true);
    expect(parsed.case === opaque).toBe(true); expect(parsed.seconds).toBe(60); expect(parsed.extra).toBe(answer.extra);
    expect(Object.keys(parsed)).toEqual(Object.keys(answer));
  });

  it.each([undefined, 0, 'opaque', [], false].map(value => [value]))('rejects a non-view outer case value %s', value => {
    expect(parseCaseIntentAnswer({accepted:true,reason:null,message:'',case:value})).toBeNull();
  });

  it('does not certify any nested case shape or invent missing fields', () => {
    for (const value of [null, {}]) {
      const parsed = parseCaseIntentAnswer({accepted: true, reason: null, message: '', case: value});
      expect(parsed?.case).toBe(value); expect(parsed).not.toHaveProperty('repeat');
    }
    for (const value of [null, [], {}, {accepted: true, reason: null, message: ''},
      Object.assign(Object.create({accepted: true, reason: null, message: ''}), {case: {}}),
      {accepted: 1, reason: null, message: '', case: {}}, {accepted: true, reason: 'wrong_pair', message: '', case: {}},
      {accepted: false, reason: null, message: '', case: {}}, {accepted: false, reason: '', message: '', case: {}},
      {accepted: true, reason: null, message: 1, case: {}}, {accepted: true, reason: null, message: '', repeat: 'true', case: {}}]) {
      expect(parseCaseIntentAnswer(value)).toBeNull();
    }
  });
});
