// 회원 인증 서비스. 게임은 이 인터페이스만 사용한다.
//
//   auth.init()                         → Promise<user|null>   저장된 세션 복구
//   auth.user                           → { id, username, name } | null
//   auth.login(username, password)      → Promise<user>         실패 시 throw
//   auth.logout()                       → Promise<void>
//   auth.register(username, password)   → Promise<user>         (로컬: 시드용 / Firebase: 시드 스크립트가 사용)
//
// - LocalAuth   : 브라우저 저장소에 회원(PBKDF2 해시)을 두는 테스트 구현. 세션은 탭 단위(sessionStorage).
// - FirebaseAuth: Firebase Authentication(이메일/비밀번호). 아이디를 내부 이메일로 매핑해서 사용한다.
import { CONFIG } from '../config.js';
import { hashPassword, verifyPassword, sha256hex } from './crypto.js';

/** 테스트 회원 (로컬 모드에서 최초 실행 시 해시해서 저장) */
export const SEED_MEMBERS = [
  { username: '박준기', password: '1111' },
  { username: '임준혁', password: '2222' },
  { username: '김민수', password: '3333' },
  { username: '이서연', password: '4444' },
  { username: '최지훈', password: '5555' },
  { username: '정하늘', password: '6666' },
];

const KEY_MEMBERS = 'hb:members';
const KEY_SESSION = 'hb:session';

export class LocalAuth {
  constructor() { this.user = null; this._listeners = new Set(); }

  _members() { try { return JSON.parse(localStorage.getItem(KEY_MEMBERS) || '{}'); } catch { return {}; } }
  _save(m) { localStorage.setItem(KEY_MEMBERS, JSON.stringify(m)); }

  async init() {
    // 시드 회원이 없으면 해시해서 생성
    const m = this._members();
    let changed = false;
    for (const s of SEED_MEMBERS) {
      if (!m[s.username]) { m[s.username] = { id: 'm_' + (await sha256hex(s.username)).slice(0, 12), username: s.username, name: s.username, password: await hashPassword(s.password), createdAt: Date.now() }; changed = true; }
    }
    if (changed) this._save(m);
    const saved = sessionStorage.getItem(KEY_SESSION);
    if (saved) { const u = m[saved]; if (u) this.user = { id: u.id, username: u.username, name: u.name }; }
    return this.user;
  }

  async login(username, password) {
    const u = this._members()[username.trim()];
    if (!u || !(await verifyPassword(password, u.password))) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    this.user = { id: u.id, username: u.username, name: u.name };
    sessionStorage.setItem(KEY_SESSION, u.username);
    return this.user;
  }

  async logout() { this.user = null; sessionStorage.removeItem(KEY_SESSION); }

  async register(username, password, name = username) {
    const m = this._members();
    if (m[username]) throw new Error('이미 있는 아이디입니다.');
    m[username] = { id: 'm_' + (await sha256hex(username)).slice(0, 12), username, name, password: await hashPassword(password), createdAt: Date.now() };
    this._save(m);
    return { id: m[username].id, username, name };
  }
}

/** 아이디 → Firebase 이메일 (한글 아이디도 안전하게) */
export async function emailForUsername(username) {
  return `m-${(await sha256hex(username.trim())).slice(0, 24)}@horsebattle.app`;
}

/** 사용자가 입력한 비밀번호 → Firebase 비밀번호. Firebase 는 6자 이상만 받으므로 아이디와 함께 SHA-256 으로 늘린다. */
export async function passwordForFirebase(username, password) {
  return sha256hex(`hb:${username.trim()}:${password}`);
}

export class FirebaseAuth {
  constructor() { this.user = null; this._auth = null; }

  async _ready() {
    if (this._auth) return;
    const [{ getFirebaseApp }, fbAuth, fs] = await Promise.all([
      import('../net/firebaseApp.js'), import('firebase/auth'), import('firebase/firestore'),
    ]);
    this.fb = fbAuth; this.fs = fs;
    const app = getFirebaseApp();
    this._auth = fbAuth.getAuth(app);
    this._db = fs.getFirestore(app);
    await fbAuth.setPersistence(this._auth, fbAuth.browserSessionPersistence);   // 탭 단위 세션
  }

  /** 회원 프로필: Cloud Firestore users/{uid} */
  async _profile(uid) {
    const snap = await this.fs.getDoc(this.fs.doc(this._db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  }

  async _toUser(fbUser) {
    if (!fbUser) return null;
    const p = await this._profile(fbUser.uid);
    return { id: fbUser.uid, username: p ? p.username : fbUser.email, name: p ? p.name : fbUser.displayName || fbUser.email };
  }

  async init() {
    await this._ready();
    const fbUser = await new Promise(res => { const off = this.fb.onAuthStateChanged(this._auth, u => { off(); res(u); }); });
    this.user = await this._toUser(fbUser);
    return this.user;
  }

  async login(username, password) {
    await this._ready();
    try {
      const cred = await this.fb.signInWithEmailAndPassword(this._auth, await emailForUsername(username), await passwordForFirebase(username, password));
      this.user = await this._toUser(cred.user);
      return this.user;
    } catch (e) {
      throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  }

  async logout() { await this._ready(); await this.fb.signOut(this._auth); this.user = null; }

  /** 회원 생성 + 프로필 기록 (시드 스크립트/관리용) */
  async register(username, password, name = username) {
    await this._ready();
    const cred = await this.fb.createUserWithEmailAndPassword(this._auth, await emailForUsername(username), await passwordForFirebase(username, password));
    await this.fb.updateProfile(cred.user, { displayName: name });
    await this.fs.setDoc(this.fs.doc(this._db, 'users', cred.user.uid), { username, name, createdAt: Date.now(), balance: CONFIG.startBalance }, { merge: true });
    return { id: cred.user.uid, username, name };
  }
}

export function createAuth() {
  return CONFIG.adapter === 'firebase' ? new FirebaseAuth() : new LocalAuth();
}
