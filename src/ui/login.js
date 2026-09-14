// 로그인 화면
import { $ } from './dom.js';
import { CONFIG } from '../config.js';
import { SEED_MEMBERS } from '../services/auth.js';

export function initLogin({ auth, onLoggedIn }) {
  const idEl = $('loginId'), pwEl = $('loginPw'), errEl = $('loginErr'), btn = $('loginBtn');

  async function submit() {
    const id = idEl.value.trim(), pw = pwEl.value;
    if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 입력하세요.'; return; }
    btn.disabled = true; errEl.textContent = '';
    try { await auth.login(id, pw); pwEl.value = ''; onLoggedIn(auth.user); }
    catch (e) { errEl.textContent = e.message; }
    finally { btn.disabled = false; }
  }

  btn.addEventListener('click', submit);
  idEl.addEventListener('keydown', e => { if (e.key === 'Enter') pwEl.focus(); });
  pwEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  // 로컬 테스트 모드에서만 테스트 회원 안내를 보여준다
  $('loginHint').innerHTML = CONFIG.adapter === 'firebase'
    ? ''
    : '로컬 테스트 모드 · 테스트 회원: ' + SEED_MEMBERS.map(m => `<code>${m.username} / ${m.password}</code>`).join(' ');

  return { focus: () => idEl.focus() };
}
