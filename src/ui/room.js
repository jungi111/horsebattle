// 방 화면 사이드바: 진행/참가자/출주표/배팅/결과 카드
import { $, fmt, escapeHtml, toast, show } from './dom.js';
import * as E from '../core/engine.js';
import { BET_TYPES, isHit } from '../core/settlement.js';
import * as Audio from '../services/audio.js';

export class RoomView {
  constructor(session) {
    this.s = session;
    this.selectedIdx = -1;
    this.betType = 'win';
    this._wire();
    session.addEventListener('room', () => this.render());
    session.addEventListener('race', () => { this.selectedIdx = -1; show('resultCard', false); });
    session.addEventListener('rescued', e => toast(`잔고가 ${fmt(e.detail)}원으로 복구되었습니다.`));
  }

  _wire() {
    const s = this.s;
    $('startGameBtn').addEventListener('click', () => { Audio.init(); s.startGame(); });
    $('startRaceBtn').addEventListener('click', () => { Audio.init(); s.startRace(); });
    $('nextRaceBtn').addEventListener('click', () => s.nextRace());
    $('leaveBtn').addEventListener('click', () => s.leaveRoom());
    $('autoBetBtn').addEventListener('click', async () => {
      const on = !s.autoBet;
      await s.setAutoBet(on);
      this.renderAutoBet();
      toast(on ? '자동 배팅 ON: 말을 안 고르면 무작위 말에 배팅합니다.' : '자동 배팅 OFF: 말을 안 고르면 관전합니다.');
    });
    $('hdCode').addEventListener('click', async () => {
      const link = s.inviteLink();
      try { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했습니다.'); }
      catch { prompt('초대 링크', link); }
    });
    $('muteBtn').addEventListener('click', () => { Audio.setMuted(!Audio.isMuted()); $('muteBtn').textContent = Audio.isMuted() ? '🔇' : '🔊'; });
    document.querySelectorAll('.bet-type button').forEach(b => b.addEventListener('click', () => {
      this.betType = b.dataset.type;
      document.querySelectorAll('.bet-type button').forEach(x => x.classList.toggle('active', x === b));
    }));
  }

  render() {
    const s = this.s, room = s.room; if (!room) return;
    const ph = room.phase, no = s.no, p = s.myPlayer, race = s.race;

    // 헤더
    $('hdCode').textContent = s.code;
    $('hdName').textContent = s.me.name;
    $('hdBalance').textContent = fmt(p ? p.balance : 0);
    $('hdBet').textContent = `배팅 ${fmt(s.betAmount)}원`;

    this.renderAutoBet();

    // 진행 카드
    $('hostLabel').textContent = s.isHost ? '내가 방장' : `방장: ${(s.players[room.hostId] || {}).name || '-'}`;
    show('startGameBtn', s.isHost && ph === 'lobby');
    show('startRaceBtn', s.isHost && ph === 'betting');
    show('nextRaceBtn', s.isHost && ph === 'result');
    const betCount = Object.keys(s.betsFor(no)).length, total = Object.keys(s.players).length;
    $('hostNote').textContent = ph === 'betting' ? `말 선택 ${betCount} / ${total}명` : '';
    show('hostNote', ph === 'betting');

    // 참가자: 잔고(시드) 많은 순, 5명 넘으면 스크롤 (CSS .player-list)
    const list = $('playerList'); list.innerHTML = '';
    const arr = Object.entries(s.players).sort((a, b) => b[1].balance - a[1].balance || a[1].joinedAt - b[1].joinedAt);
    $('playerCount').textContent = `${arr.length}명`;
    arr.forEach(([pid, pl], i) => {
      const b = s.betsFor(no)[pid];
      const betText = b && race
        ? `${race.horses[b.horse].num}번 ${BET_TYPES[b.type]}${b.auto ? ' (자동)' : ''}`
        : (ph === 'betting' ? (pl.autoBet === false ? '선택 전 · 자동 OFF' : '선택 전') : (ph === 'racing' || ph === 'result') && no > 0 ? '관전' : '');
      const row = document.createElement('div');
      row.className = 'player-row' + (pid === s.me.id ? ' me' : '');
      row.innerHTML = `<span class="rank">${i + 1}</span>
        <span class="pname">${escapeHtml(pl.name)}${pid === room.hostId ? '<span class="host">방장</span>' : ''}</span>
        <span class="pbet${b ? '' : ' none'}">${betText}</span>
        <span class="pbal">${fmt(pl.balance)}</span>`;
      list.appendChild(row);
    });

    // 출주표
    $('raceTitle').textContent = no > 0 ? `제${no}경주 · ${E.RACE_METERS}m 더트` : '출주표';
    this.renderHorseList();

    // 배팅 (출주표 카드 안): 말을 누르면 즉시 배팅, 다른 말을 누르면 교체
    const canBet = ph === 'betting' && !!p;
    const b = s.myBet;
    show('betTypeRow', canBet);
    show('betDone', canBet && !!b);
    if (canBet && b) {
      const h = race.horses[b.horse];
      $('myBetBox').innerHTML = `<b>${h.num}번 ${h.name}</b> · ${BET_TYPES[b.type]} × ${b.odds.toFixed(1)}배 · 적중 시 <b style="color:var(--accent2)">${fmt(b.amount * b.odds)}원</b>`;
    }

    // 결과 카드
    if ((ph === 'result' || (race && race.done)) && no > 0) this.renderResult(); else show('resultCard', false);
  }

  renderHorseList() {
    const s = this.s, listEl = $('horseList'); listEl.innerHTML = '';
    if (!s.race || !s.room || s.room.phase === 'lobby') { listEl.innerHTML = '<div class="empty">게임이 시작되면 출주표가 나옵니다.</div>'; return; }
    const mine = s.myBet, selectable = s.room.phase === 'betting';
    s.race.horses.forEach(h => {
      const row = document.createElement('div');
      const sel = !!mine && mine.horse === h.idx;
      row.className = 'horse-row' + (sel ? ' selected' : '') + (selectable ? '' : ' disabled');
      row.innerHTML = `
        <div class="num" style="background:${h.silk};color:${h.silkText}">${h.num}</div>
        <div><div class="hname">${h.name}</div><div class="hsub">기수 ${h.jockey} · ${h.weight}kg</div></div>
        <div class="odds">${h.oddsWin.toFixed(1)}<small>단승</small></div>
        <div class="odds" style="color:var(--info)">${h.oddsPlace.toFixed(1)}<small>연승</small></div>`;
      row.addEventListener('click', async () => {
        if (s.room.phase !== 'betting' || this._betting) return;
        if (s.myBet && s.myBet.horse === h.idx && s.myBet.type === this.betType) return;   // 같은 배팅
        Audio.init();
        this._betting = true;
        try {
          await s.placeBet(h.idx, this.betType);
          toast(`${h.num}번 ${h.name} ${BET_TYPES[this.betType]} ${fmt(s.betAmount)}원 배팅`);
        } catch (e) { toast(e.message); }
        finally { this._betting = false; }
      });
      listEl.appendChild(row);
    });
  }

  renderAutoBet() {
    const on = this.s.autoBet, btn = $('autoBetBtn');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.querySelector('.label').textContent = on ? '자동 배팅 ON' : '자동 배팅 OFF';
  }

  renderResult() {
    const s = this.s, race = s.race;
    if (!race || !race.done) return;
    const no = s.no;
    show('resultCard', true);
    $('resultTitle').textContent = `제${no}경주`;
    const list = $('resultList'); list.innerHTML = '';
    race.finishOrder.slice(0, 5).forEach((idx, i) => {
      const h = race.horses[idx];
      const gap = i === 0 ? '' : E.marginText(E.timeGapPx(h.finishTime - race.horses[race.finishOrder[i - 1]].finishTime));
      const div = document.createElement('div'); div.className = 'result-line';
      div.innerHTML = `<span class="rank">${i + 1}착</span><div class="num" style="background:${h.silk};color:${h.silkText}">${h.num}</div>
        <span>${h.name}</span><span class="t">${gap ? gap + ' · ' : ''}${h.finishTime.toFixed(2)}s</span>`;
      list.appendChild(div);
    });
    const box = $('payoutBox'), b = s.myBet;
    if (!b) { box.className = 'payout none'; box.textContent = '이번 경주는 관전했습니다. (자동 배팅 OFF)'; }
    else {
      const h = race.horses[b.horse], rank = race.finishOrder.indexOf(b.horse), hit = isHit(b, race.finishOrder);
      box.className = 'payout ' + (hit ? 'win' : 'lose');
      box.textContent = hit ? `적중! ${h.num}번 ${h.name} ${rank + 1}착 · +${fmt(Math.floor(b.amount * b.odds))}원` : `아쉽네요. ${h.num}번 ${h.name} ${rank + 1}착 · -${fmt(b.amount)}원`;
    }
    const pl = $('payoutList'); pl.innerHTML = '';
    Object.entries(s.betsFor(no)).forEach(([pid, bb]) => {
      const p = s.players[pid]; if (!p) return;
      const h = race.horses[bb.horse], hit = isHit(bb, race.finishOrder);
      const net = hit ? Math.floor(bb.amount * bb.odds) - bb.amount : -bb.amount;
      const line = document.createElement('div');
      line.innerHTML = `<b>${escapeHtml(p.name)}</b> · ${h.num}번 ${BET_TYPES[bb.type]}${bb.auto ? '(자동)' : ''} → <span class="${net >= 0 ? 'plus' : 'minus'}">${net >= 0 ? '+' : ''}${fmt(net)}</span>`;
      pl.appendChild(line);
    });
    if (!s.resultFor(no)) { const n = document.createElement('div'); n.textContent = '방장 기기에서 정산을 기록하는 중...'; pl.appendChild(n); }
  }
}
