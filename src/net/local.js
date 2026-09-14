// 로컬 어댑터: 같은 브라우저의 탭들끼리 localStorage + BroadcastChannel 로 방 상태를 공유한다.
// Firebase 어댑터와 같은 인터페이스(./adapter.js 참고)라서 설정만 바꾸면 그대로 온라인으로 전환된다.
import { applyPatch } from './adapter.js';

const PREFIX = 'hb:room:';

export class LocalAdapter {
  constructor() {
    this.subs = new Map();   // code -> Set<cb>
    this.channel = ('BroadcastChannel' in window) ? new BroadcastChannel('hb-rooms') : null;
  }

  async connect() {
    if (this.channel) this.channel.onmessage = e => this._notify(e.data && e.data.code);
    window.addEventListener('storage', e => {
      if (e.key && e.key.startsWith(PREFIX)) this._notify(e.key.slice(PREFIX.length));
    });
  }

  now() { return Date.now(); }

  _read(code) {
    try { const raw = localStorage.getItem(PREFIX + code); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  _write(code, room) {
    localStorage.setItem(PREFIX + code, JSON.stringify(room));
    if (this.channel) this.channel.postMessage({ code });
    this._notify(code);
  }
  _notify(code) {
    const set = this.subs.get(code);
    if (!set) return;
    const room = this._read(code);
    set.forEach(cb => cb(room));
  }

  async createRoom(code, room) {
    if (this._read(code)) throw new Error('이미 존재하는 방 코드입니다.');
    this._write(code, room);
  }

  async getRoom(code) { return this._read(code); }

  subscribe(code, cb) {
    if (!this.subs.has(code)) this.subs.set(code, new Set());
    this.subs.get(code).add(cb);
    cb(this._read(code));
    return () => { const s = this.subs.get(code); if (s) s.delete(cb); };
  }

  async update(code, patch) {
    const room = this._read(code);
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    applyPatch(room, patch);
    this._write(code, room);
  }

  /** path 값이 true 가 아니면 true 로 바꾼다 (로컬 테스트용: 탭 내에서는 동기적이라 안전) */
  async claim(code, path) {
    const room = this._read(code);
    if (!room) return false;
    const keys = path.split('/').filter(Boolean);
    let cur = room;
    for (const k of keys.slice(0, -1)) { if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k]; }
    const last = keys[keys.length - 1];
    if (cur[last] === true) return false;
    cur[last] = true;
    this._write(code, room);
    return true;
  }
}
