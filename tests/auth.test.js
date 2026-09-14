// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sha256hex } from '../src/services/crypto.js';

test('비밀번호는 해시로 저장되고 평문이 남지 않는다', async () => {
  const rec = await hashPassword('1111');
  assert.equal(rec.algo, 'PBKDF2-SHA256');
  assert.ok(rec.salt.length > 10 && rec.hash.length > 10);
  assert.ok(!JSON.stringify(rec).includes('1111'));
});

test('올바른 비밀번호만 통과한다', async () => {
  const rec = await hashPassword('2222');
  assert.equal(await verifyPassword('2222', rec), true);
  assert.equal(await verifyPassword('2223', rec), false);
  assert.equal(await verifyPassword('', rec), false);
});

test('같은 비밀번호도 솔트가 달라 해시가 다르다', async () => {
  const a = await hashPassword('1111'), b = await hashPassword('1111');
  assert.notEqual(a.hash, b.hash);
});

test('아이디 → 이메일 매핑은 결정적이다', async () => {
  assert.equal(await sha256hex('박준기'), await sha256hex('박준기'));
  assert.notEqual(await sha256hex('박준기'), await sha256hex('임준혁'));
});
