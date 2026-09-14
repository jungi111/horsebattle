// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, step, advanceTo, summarize, simulateResult, STEP } from '../src/core/engine.js';
import { settle, isHit } from '../src/core/settlement.js';
import { makeRng, hashSeed } from '../src/core/rng.js';

test('같은 시드는 같은 결과를 낸다', () => {
  const a = simulateResult('ROOM-1-ABC'), b = simulateResult('ROOM-1-ABC');
  assert.deepEqual(a, b);
});

test('다른 시드는 다른 결과를 낸다', () => {
  const a = simulateResult('ROOM-1-ABC'), b = simulateResult('ROOM-2-ABC');
  assert.notDeepEqual(a.order, b.order);
});

test('advanceTo 는 순차 step 과 동일하다', () => {
  const r1 = createRace('X'); advanceTo(r1, 12.0);
  const r2 = createRace('X'); for (let i = 0; i < 720; i++) step(r2, STEP);
  assert.deepEqual(r1.horses.map(h => h.x), r2.horses.map(h => h.x));
  assert.equal(r1.steps, 720);
});

test('advanceTo 는 스텝 사이 보간 계수를 돌려준다', () => {
  const r = createRace('Y');
  const alpha = advanceTo(r, 1.5 * STEP);
  assert.equal(r.steps, 1);
  assert.ok(Math.abs(alpha - 0.5) < 1e-6);
});

test('경주는 8마리가 모두 도착하면 끝난다', () => {
  const r = createRace('Z');
  advanceTo(r, 120);
  assert.equal(r.done, true);
  assert.equal(r.finishOrder.length, 8);
  const s = summarize(r);
  assert.equal(new Set(s.order).size, 8);
  for (let i = 1; i < s.times.length; i++) assert.ok(s.times[i] >= s.times[i - 1]);
});

test('정산: 단승은 1착만, 연승은 3착 이내', () => {
  const order = [3, 5, 1, 0, 2, 4, 6, 7];
  assert.equal(isHit({ horse: 3, type: 'win' }, order), true);
  assert.equal(isHit({ horse: 5, type: 'win' }, order), false);
  assert.equal(isHit({ horse: 1, type: 'place' }, order), true);
  assert.equal(isHit({ horse: 0, type: 'place' }, order), false);
  const out = settle({
    a: { horse: 3, type: 'win', amount: 1000, odds: 4.9 },
    b: { horse: 1, type: 'place', amount: 5000, odds: 1.4 },
    c: { horse: 7, type: 'win', amount: 10000, odds: 12.0 },
  }, order);
  assert.deepEqual(out.a, { rank: 0, hit: true, pay: 4900, net: 3900 });
  assert.deepEqual(out.b, { rank: 2, hit: true, pay: 7000, net: 2000 });
  assert.deepEqual(out.c, { rank: 7, hit: false, pay: 0, net: -10000 });
});

test('난수: 같은 시드는 같은 수열', () => {
  const a = makeRng('seed'), b = makeRng(hashSeed('seed'));
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
