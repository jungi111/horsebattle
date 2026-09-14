// 회원 지갑 서비스. 게임은 이 인터페이스만 사용한다.
//
//   account.user            → { id, username, name }   로그인한 회원 (auth.user)
//   account.getBalance()    → Promise<number>          지갑 잔고 (없으면 초기 잔고로 생성)
//   account.settle(net)     → Promise<number>          잔고에 net 을 더한다(트랜잭션). 반영 후 잔고
//   account.reset(balance)  → Promise<number>          잔고 복구 (테스트용)
//
// 저장소: LocalWallet(브라우저 localStorage) / FirestoreWallet(Cloud Firestore users/{uid}, 트랜잭션으로 갱신)
// 회원 문서에는 잔고만 두고 경주별 정산 기록(로그)은 남기지 않는다 — 중복 정산 방지는
// 방(room, Realtime Database)의 results/{no}/settledBy 플래그로 처리한다 (game/session.js 참고).
// 방(room)의 players/{pid}/balance 는 화면 표시용 미러이며 진짜 잔고는 항상 여기 있다.
import { CONFIG } from '../config.js';

const KEY_WALLET = uid => `hb:wallet:${uid}`;

export class LocalWallet {
  constructor(user) { this.user = user; }

  _read() {
    try { const raw = localStorage.getItem(KEY_WALLET(this.user.id)); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
    return { balance: CONFIG.startBalance };
  }
  _save(w) { localStorage.setItem(KEY_WALLET(this.user.id), JSON.stringify(w)); }

  async getBalance() { const w = this._read(); this._save(w); return w.balance; }

  async settle(net) {
    const w = this._read();
    w.balance += net;
    this._save(w);
    return w.balance;
  }

  async reset(balance = CONFIG.startBalance) { const w = this._read(); w.balance = balance; this._save(w); return balance; }
}

/** Cloud Firestore users/{uid} 문서: { username, name, createdAt, balance } — 경주 기록은 저장하지 않는다 */
export class FirestoreWallet {
  constructor(user) { this.user = user; this._db = null; }

  async _ready() {
    if (this._db) return;
    const [{ getFirebaseApp }, fs] = await Promise.all([import('../net/firebaseApp.js'), import('firebase/firestore')]);
    this.fs = fs; this._db = fs.getFirestore(getFirebaseApp());
  }
  _doc() { return this.fs.doc(this._db, 'users', this.user.id); }

  /** 문서가 없으면 초기 잔고로 생성하고, 현재 문서를 돌려준다 */
  async _ensure(tx) {
    const snap = await tx.get(this._doc());
    if (snap.exists() && typeof snap.data().balance === 'number') return snap.data();
    const data = { ...(snap.exists() ? snap.data() : {}), username: this.user.username, name: this.user.name, balance: CONFIG.startBalance, createdAt: Date.now() };
    tx.set(this._doc(), data, { merge: true });
    return data;
  }

  async getBalance() {
    await this._ready();
    return this.fs.runTransaction(this._db, async tx => (await this._ensure(tx)).balance);
  }

  async settle(net) {
    await this._ready();
    return this.fs.runTransaction(this._db, async tx => {
      const data = await this._ensure(tx);
      const balance = data.balance + net;
      tx.update(this._doc(), { balance });
      return balance;
    });
  }

  async reset(balance = CONFIG.startBalance) {
    await this._ready();
    await this.fs.setDoc(this._doc(), { balance }, { merge: true });
    return balance;
  }
}

export function createAccount(user) {
  return CONFIG.adapter === 'firebase' ? new FirestoreWallet(user) : new LocalWallet(user);
}
