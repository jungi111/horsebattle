// Firebase Realtime Database 어댑터 (방 상태 공유)
// 활성화: .env.local 에 VITE_ADAPTER=firebase 와 VITE_FB_* 값을 넣는다. (.env.example 참고)
import { getDatabase, ref, get, update, onValue, runTransaction } from 'firebase/database';
import { getFirebaseApp } from './firebaseApp.js';

export class FirebaseAdapter {
  constructor() { this.db = null; this.offset = 0; }

  async connect() {
    this.db = getDatabase(getFirebaseApp());
    // 기기 간 시계 차이 보정: 출발 시각을 서버 시간 기준으로 맞춘다
    onValue(ref(this.db, '.info/serverTimeOffset'), s => { this.offset = s.val() || 0; });
  }

  now() { return Date.now() + this.offset; }

  _ref(code) { return ref(this.db, 'rooms/' + code); }

  async createRoom(code, room) {
    const res = await runTransaction(this._ref(code), cur => (cur === null ? room : undefined));
    if (!res.committed) throw new Error('이미 존재하는 방 코드입니다.');
  }

  async getRoom(code) {
    const snap = await get(this._ref(code));
    return snap.exists() ? snap.val() : null;
  }

  subscribe(code, cb) {
    return onValue(this._ref(code), snap => cb(snap.exists() ? snap.val() : null));
  }

  async update(code, patch) {
    await update(this._ref(code), patch);
  }

  /** path 값이 true 가 아니면 원자적으로 true 로 바꾼다 (동시 정산 중복 방지용 선점) */
  async claim(code, path) {
    const res = await runTransaction(ref(this.db, `rooms/${code}/${path}`), cur => (cur === true ? undefined : true));
    return res.committed;
  }
}
