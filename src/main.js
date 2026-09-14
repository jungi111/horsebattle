// 부트스트랩: 로그인 → 로비 → 방
import './styles/main.css';
import { createAdapter } from './net/adapter.js';
import { createAuth } from './services/auth.js';
import { createAccount } from './services/account.js';
import * as Audio from './services/audio.js';
import { GameSession } from './game/session.js';
import { startRaceLoop } from './game/raceLoop.js';
import { Renderer } from './render/renderer.js';
import { initLogin } from './ui/login.js';
import { initLobby } from './ui/lobby.js';
import { RoomView } from './ui/room.js';
import { $, toast } from './ui/dom.js';

function showScreen(name) {
  document.body.classList.toggle('in-room', name === 'room');   // 게임 화면에서는 헤더 로고를 숨겨 공간 확보
  $('screenLogin').style.display = name === 'login' ? '' : 'none';
  $('screenLobby').style.display = name === 'lobby' ? '' : 'none';
  $('screenRoom').style.display = name === 'room' ? '' : 'none';
  $('headerUser').style.display = name === 'lobby' ? '' : 'none';
  $('headerRoom').style.display = name === 'room' ? '' : 'none';
}
// 헤더 높이를 CSS 변수로 (경기 화면 고정 위치 계산용)
function syncHeaderHeight() { document.documentElement.style.setProperty('--hdr-h', document.querySelector('header').offsetHeight + 'px'); }
window.addEventListener('resize', syncHeaderHeight);
new ResizeObserver(syncHeaderHeight).observe(document.querySelector('header'));

function setUrl(q) { try { history.replaceState(null, '', location.pathname + q); } catch { /* file:// */ } }

async function boot() {
  const auth = createAuth();
  let adapter;
  try {
    adapter = await createAdapter();
    await adapter.connect();
    await auth.init();
  } catch (e) {
    showScreen('login');
    $('loginErr').textContent = '연결 실패: ' + e.message;
    return;
  }

  // 세션·화면은 한 번만 만들고, 로그인마다 회원 지갑만 교체한다
  const renderer = new Renderer($('track'));
  const session = new GameSession({ adapter });
  const view = new RoomView(session);
  startRaceLoop({ session, renderer, view });
  const lobby = initLobby({
    session,
    onEntered: () => { showScreen('room'); setUrl('?room=' + session.code); },
  });
  session.addEventListener('exit', () => { showScreen('lobby'); setUrl(''); lobby.refreshWallet(); toast('방에서 나왔습니다.'); });

  function enterLobby(user) {
    $('hdUser').textContent = `${user.name} 님`;
    session.setAccount(createAccount(user));
    showScreen('lobby');
    lobby.refresh();
  }

  const login = initLogin({ auth, onLoggedIn: enterLobby });
  $('logoutBtn').addEventListener('click', async () => { await auth.logout(); session.setAccount(null); showScreen('login'); login.focus(); });
  const roomQuery = new URLSearchParams(location.search).get('room');
  document.addEventListener('click', () => Audio.init(), { once: true });

  if (auth.user) enterLobby(auth.user);
  else { showScreen('login'); if (roomQuery) $('loginHint').insertAdjacentHTML('beforeend', '로그인하면 초대받은 방으로 바로 들어갑니다.'); login.focus(); }
}

boot();
