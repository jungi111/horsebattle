// 게임 세션: 방 상태(공유 저장소)와 내 지갑(계정 서비스)을 연결한다. DOM 없음.
//
// 방 스키마 (rooms/{code})
//   code, hostId, createdAt, betAmount
//   phase   : 'lobby' | 'betting' | 'racing' | 'result'
//   race    : { no, seed, startAt }        // startAt: 출발 시각(ms). 모든 기기가 이 시각 기준으로 같은 시드를 재생
//   players : { [pid]: { name, balance, joinedAt, autoBet } }   // balance 는 표시용 미러(진짜 잔고는 지갑). autoBet: 말을 안 고르면 자동 배팅 여부
//   bets    : { [no]: { [pid]: { horse, type, amount, odds, auto? } } }
//   results : { [no]: { seed, order, times, payouts: { [pid]: { rank, hit, pay, net } } } }   // 방장이 기록
import { CONFIG } from '../config.js';
import * as E from '../core/engine.js';
import { settle, BET_AMOUNTS } from '../core/settlement.js';
import { randomCode } from '../core/rng.js';

export class GameSession extends EventTarget {
  constructor({ adapter }) {
    super();
    this.adapter = adapter;
    this.account = null;
    this.code = null; this.room = null; this.unsub = null;
    this.race = null; this.raceSeed = undefined;
    this.resultWrittenFor = null;
    this.settledKeys = new Set();
  }

  /** 로그인한 회원의 지갑을 연결 (로그인/로그아웃 시 호출) */
  setAccount(account) {
    this.account = account;
    this.settledKeys = new Set();
  }
  get me() { return this.account ? this.account.user : { id: null, name: '' }; }

  // ---------- 조회 ----------
  get isHost() { return !!this.room && this.room.hostId === this.me.id; }
  get players() { return (this.room && this.room.players) || {}; }
  get myPlayer() { return this.players[this.me.id] || null; }
  get no() { return (this.room && this.room.race && this.room.race.no) || 0; }
  get betAmount() { return (this.room && this.room.betAmount) || BET_AMOUNTS[0]; }
  betsFor(no) { return (this.room && this.room.bets && this.room.bets[no]) || {}; }
  get myBet() { return this.betsFor(this.no)[this.me.id] || null; }
  resultFor(no) { return (this.room && this.room.results && this.room.results[no]) || null; }
  inviteLink() { return location.href.split('?')[0].split('#')[0] + '?room=' + this.code; }
  /** 내 자동 배팅 설정 (방 안 값 우선, 없으면 브라우저에 저장된 선호값, 기본 ON) */
  get autoBet() { const p = this.myPlayer; return p ? p.autoBet !== false : this.autoBetPref; }
  get autoBetPref() { return localStorage.getItem('hb:autoBet') !== 'off'; }
  async setAutoBet(on) {
    localStorage.setItem('hb:autoBet', on ? 'on' : 'off');
    if (this.room && this.myPlayer) await this.adapter.update(this.code, { [`players/${this.me.id}/autoBet`]: !!on });
  }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ---------- 방 만들기 / 참가 / 나가기 ----------
  async createRoom(betAmount) {
    if (!BET_AMOUNTS.includes(betAmount)) throw new Error('배팅 금액은 1,000 / 5,000 / 10,000원 중 하나여야 합니다.');
    const name = this.me.name;
    const code = randomCode(6), now = this.adapter.now();
    const balance = await this.account.getBalance();
    await this.adapter.createRoom(code, {
      code, hostId: this.me.id, createdAt: now, betAmount, phase: 'lobby',
      race: { no: 0, seed: null, startAt: null },
      players: { [this.me.id]: { name, balance, joinedAt: now, autoBet: this.autoBetPref } },
      bets: {}, results: {},
    });
    this._enter(code);
    return code;
  }

  async joinRoom(code) {
    const name = this.me.name;
    const r = await this.adapter.getRoom(code);
    if (!r) throw new Error('방을 찾을 수 없습니다. 코드를 확인하세요.');
    const prev = r.players && r.players[this.me.id];
    const balance = await this.account.getBalance();
    const patch = { [`players/${this.me.id}`]: { name, balance, joinedAt: prev ? prev.joinedAt : this.adapter.now(), autoBet: prev ? prev.autoBet !== false : this.autoBetPref } };
    if (!r.hostId) patch.hostId = this.me.id;   // 빈 방이면 방장 승계
    await this.adapter.update(code, patch);
    this._enter(code);
  }

  _enter(code) {
    this.code = code;
    this.unsub = this.adapter.subscribe(code, r => this._onRoom(r));
  }

  async leaveRoom() {
    if (this.room) {
      const patch = { [`players/${this.me.id}`]: null };
      if (this.isHost) {
        const others = Object.entries(this.players).filter(([id]) => id !== this.me.id).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
        patch.hostId = others.length ? others[0][0] : null;
      }
      try { await this.adapter.update(this.code, patch); } catch { /* 이미 사라진 방 */ }
    }
    this._exit();
  }

  _exit() {
    if (this.unsub) this.unsub();
    this.unsub = null; this.room = null; this.code = null; this.race = null; this.raceSeed = undefined;
    this._emit('exit');
  }

  // ---------- 방 상태 수신 ----------
  async _onRoom(r) {
    if (!r) { this._exit(); return; }
    this.room = r;
    if (!this.myPlayer) { this._exit(); return; }

    const seed = r.race && r.race.seed ? r.race.seed : null;
    if (seed !== this.raceSeed) {
      this.raceSeed = seed;
      this.race = E.createRace(seed || ('lobby-' + this.code));
      this.resultWrittenFor = null;
      this._emit('race', this.race);
    }
    await this._settleToWallet();
    await this._rescueGuest();
    this._emit('room', r);
  }

  /**
   * 결과가 기록되면 내 몫을 지갑에 반영한다. 지갑(회원 문서)에는 잔고만 두고 경주별 기록은 남기지 않는다.
   * 중복 반영 방지는 방(room, Realtime Database)의 results/{no}/settledBy/{pid} 플래그를 원자적으로
   * 선점(claim)해서 한다 — 같은 계정으로 여러 기기/탭이 동시에 열려 있어도 한 번만 적립된다.
   * 회원제에서 서버 정산으로 옮길 때는 이 메서드 전체가 서버 쪽으로 이동한다.
   */
  async _settleToWallet() {
    const no = this.no, res = this.resultFor(no);
    if (!res || !res.payouts || !res.payouts[this.me.id]) return;
    const key = `${this.code}:${no}`;
    if (this.settledKeys.has(key)) return;
    if (res.settledBy && res.settledBy[this.me.id]) { this.settledKeys.add(key); return; }
    this.settledKeys.add(key);
    const won = await this.adapter.claim(this.code, `results/${no}/settledBy/${this.me.id}`);
    if (!won) return;   // 다른 기기/탭이 먼저 반영함
    const p = res.payouts[this.me.id];
    const bal = await this.account.settle(p.net);
    await this.adapter.update(this.code, { [`players/${this.me.id}/balance`]: bal });
  }

  /** 지갑이 배팅액 미만이면 배팅 단계에서 초기 잔고로 복구 (CONFIG.rescueBelowBet, 테스트용) */
  async _rescueGuest() {
    if (!CONFIG.rescueBelowBet) return;
    if (this.room.phase !== 'betting' || this.myBet) return;
    const bal = await this.account.getBalance();
    if (bal >= this.betAmount) return;
    const fresh = await this.account.reset(CONFIG.startBalance);
    await this.adapter.update(this.code, { [`players/${this.me.id}/balance`]: fresh });
    this._emit('rescued', fresh);
  }

  // ---------- 방장 동작 ----------
  _newSeed(no) { return `${this.code}-${no}-${randomCode(6)}`; }

  async startGame() {
    if (!this.isHost || this.room.phase !== 'lobby') return;
    await this.adapter.update(this.code, { phase: 'betting', race: { no: 1, seed: this._newSeed(1), startAt: null } });
  }

  /** 배팅 마감 + 출발. 말을 고르지 않은 참가자 중 자동 배팅이 켜진 사람은 무작위 말에 자동 배팅(잔고가 있을 때), 꺼진 사람은 관전. */
  async startRace() {
    if (!this.isHost || this.room.phase !== 'betting' || !this.race) return;
    const no = this.no, amt = this.betAmount, bets = this.betsFor(no);
    const patch = { phase: 'racing', 'race/startAt': this.adapter.now() + CONFIG.countdownSec * 1000 };
    Object.entries(this.players).forEach(([pid, p]) => {
      if (bets[pid] || p.autoBet === false || p.balance < amt) return;
      const h = this.race.horses[Math.floor(Math.random() * this.race.horses.length)];
      patch[`bets/${no}/${pid}`] = { horse: h.idx, type: 'win', amount: amt, odds: h.oddsWin, auto: true };
      patch[`players/${pid}/balance`] = p.balance - amt;
    });
    await this.adapter.update(this.code, patch);
  }

  async nextRace() {
    if (!this.isHost || this.room.phase !== 'result') return;
    const no = this.no + 1;
    await this.adapter.update(this.code, { phase: 'betting', race: { no, seed: this._newSeed(no), startAt: null } });
  }

  /** 경주가 끝나면 방장이 정산 기록 (모든 기기 결과가 같으므로 한 번만) */
  async writeResultIfHost() {
    const no = this.no;
    if (!this.isHost || !this.race || !this.race.done || this.room.phase !== 'racing' || this.resultWrittenFor === no || this.resultFor(no)) return;
    this.resultWrittenFor = no;
    const sum = E.summarize(this.race);
    const payouts = settle(this.betsFor(no), sum.order);
    const patch = { [`results/${no}`]: { ...sum, payouts }, phase: 'result' };
    Object.entries(payouts).forEach(([pid, p]) => {
      if (p.pay > 0 && this.players[pid]) patch[`players/${pid}/balance`] = this.players[pid].balance + p.pay;
    });
    try { await this.adapter.update(this.code, patch); } catch { this.resultWrittenFor = null; }
  }

  // ---------- 배팅 (금액은 방에서 고정) ----------
  /** 배팅 (이미 배팅했으면 환불 후 교체를 한 번에 기록) */
  async placeBet(horseIdx, type) {
    if (!this.room || this.room.phase !== 'betting' || !this.race) return;
    const p = this.myPlayer, amt = this.betAmount, h = this.race.horses[horseIdx], prev = this.myBet;
    const available = (p ? p.balance : 0) + (prev ? prev.amount : 0);
    if (!p || !h || available < amt) throw new Error('잔고가 부족합니다.');
    const odds = type === 'win' ? h.oddsWin : h.oddsPlace;
    await this.adapter.update(this.code, {
      [`bets/${this.no}/${this.me.id}`]: { horse: h.idx, type, amount: amt, odds },
      [`players/${this.me.id}/balance`]: available - amt,
    });
  }

  async cancelBet() {
    const b = this.myBet;
    if (!b || this.room.phase !== 'betting') return;
    await this.adapter.update(this.code, {
      [`bets/${this.no}/${this.me.id}`]: null,
      [`players/${this.me.id}/balance`]: this.myPlayer.balance + b.amount,
    });
  }
}
