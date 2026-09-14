// 로비 화면: 닉네임, 방 만들기(배팅 금액 선택), 코드로 참가
import { $, fmt } from './dom.js';
import { BET_AMOUNTS } from '../core/settlement.js';
import { CONFIG } from '../config.js';

export function initLobby({ session, onEntered }) {
  const codeEl = $('codeInput'), errEl = $('lobbyErr');
  let betAmount = BET_AMOUNTS[0];

  // 배팅 금액 옵션 (3개 고정)
  const opts = $('betAmountOpts');
  opts.innerHTML = '';
  BET_AMOUNTS.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = `${fmt(v)}원`; b.className = i === 0 ? 'active' : '';
    b.addEventListener('click', () => { betAmount = v; [...opts.children].forEach(x => x.classList.toggle('active', x === b)); });
    opts.appendChild(b);
  });

  async function refreshWallet() { $('walletBalance').textContent = fmt(await session.account.getBalance()); }

  async function create() {
    errEl.textContent = '';
    try { await session.createRoom(betAmount); onEntered(); }
    catch (e) { errEl.textContent = e.message; }
  }

  async function join() {
    const code = codeEl.value.trim().toUpperCase();
    if (code.length !== 6) { errEl.textContent = '방 코드 6자리를 입력하세요.'; return; }
    errEl.textContent = '';
    try { await session.joinRoom(code); onEntered(); }
    catch (e) { errEl.textContent = e.message; }
  }

  $('createBtn').addEventListener('click', create);
  $('joinBtn').addEventListener('click', join);
  codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  $('adapterNote').textContent = CONFIG.adapter === 'firebase'
    ? 'Firebase 연결 모드 · 회원 지갑'
    : '로컬 테스트 모드 — 같은 브라우저의 다른 탭에서 다른 회원으로 로그인해 방 코드로 참가하면 동기화를 확인할 수 있습니다.';

  /** 로그인 직후: 회원 이름/잔고 표시, 초대 링크로 왔으면 자동 참가 */
  function refresh() {
    $('lobbyUser').textContent = session.me.name;
    errEl.textContent = '';
    const q = new URLSearchParams(location.search);
    if (q.get('room')) codeEl.value = q.get('room').toUpperCase();
    refreshWallet();
    if (codeEl.value.length === 6) join();
  }

  return { refreshWallet, refresh };
}
