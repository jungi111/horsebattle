// Firebase 에 테스트 회원을 만든다. (Firebase Authentication 이메일/비밀번호 + Cloud Firestore users/{uid})
//
//   node scripts/seed-members.mjs                 # scripts/members.json 의 회원 생성
//   node scripts/seed-members.mjs 아이디 비밀번호   # 한 명만 생성
//
// 준비: .env.local 에 VITE_FB_* 값, Firebase 콘솔 > Authentication > 로그인 방법 > 이메일/비밀번호 사용 설정
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

function loadEnv() {
  const env = { ...process.env };
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

async function sha256hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const emailForUsername = async u => `m-${(await sha256hex(u.trim())).slice(0, 24)}@horsebattle.app`;
// Firebase 는 6자 이상 비밀번호만 받으므로 앱과 같은 방식으로 늘린다 (src/services/auth.js 의 passwordForFirebase 와 동일)
const passwordForFirebase = async (u, p) => sha256hex(`hb:${u.trim()}:${p}`);

const env = loadEnv();
const cfg = {
  apiKey: env.VITE_FB_API_KEY, authDomain: env.VITE_FB_AUTH_DOMAIN, databaseURL: env.VITE_FB_DATABASE_URL,
  projectId: env.VITE_FB_PROJECT_ID, appId: env.VITE_FB_APP_ID,
};
if (!cfg.apiKey || !cfg.databaseURL) { console.error('.env.local 에 VITE_FB_API_KEY, VITE_FB_DATABASE_URL 등이 필요합니다.'); process.exit(1); }

const members = process.argv.length >= 4
  ? [{ username: process.argv[2], password: process.argv[3] }]
  : (() => {
      const url = new URL('./members.json', import.meta.url);
      if (!existsSync(url)) {
        console.error('scripts/members.json 이 없습니다. scripts/members.example.json 을 복사해 실제 회원 정보로 채우세요. (이 파일은 커밋하지 않습니다 — .gitignore 참고)');
        process.exit(1);
      }
      return JSON.parse(readFileSync(url, 'utf8'));
    })();

const app = initializeApp(cfg);
const auth = getAuth(app), db = getFirestore(app);
const START_BALANCE = Number(env.VITE_START_BALANCE || 10000);

for (const m of members) {
  const email = await emailForUsername(m.username);
  try {
    let user;
    try {
      user = (await createUserWithEmailAndPassword(auth, email, await passwordForFirebase(m.username, m.password))).user;
      await updateProfile(user, { displayName: m.name || m.username });
      console.log(`생성: ${m.username} (uid ${user.uid})`);
    } catch (e) {
      if (e.code !== 'auth/email-already-in-use') throw e;
      user = (await signInWithEmailAndPassword(auth, email, await passwordForFirebase(m.username, m.password))).user;   // 이미 있으면 로그인만
      console.log(`이미 있음: ${m.username} (uid ${user.uid})`);
    }
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists() || typeof snap.data().balance !== 'number') {
      await setDoc(ref, { username: m.username, name: m.name || m.username, createdAt: Date.now(), balance: START_BALANCE }, { merge: true });
      console.log(`  Firestore users/${user.uid} 생성 (잔고 ${START_BALANCE})`);
    } else {
      console.log(`  Firestore 문서 있음 (잔고 ${snap.data().balance})`);
    }
    await signOut(auth);
  } catch (e) {
    console.error(`실패: ${m.username} - ${e.code || e.message}`);
  }
}
process.exit(0);
