// 경주 엔진: DOM/오디오/시간에 의존하지 않는 순수 시뮬레이션.
// 같은 시드 + 같은 순서의 step() 호출이면 어느 기기에서든 같은 결과가 나온다.
import { hashSeed, makeRng } from './rng.js';

export const HORSE_COUNT = 8;
export const RACE_METERS = 1200;
export const PX_PER_METER = 5;
export const TRACK_LEN = RACE_METERS * PX_PER_METER;   // 6000px
export const GATE_X = 260;                              // 출발선 월드 좌표
export const FINISH_X = GATE_X + TRACK_LEN;
export const STRETCH_M = 300;                           // 최후의 직선 구간(남은 거리)
export const BASE_V = 240;                              // px/s
export const STEP = 1 / 60;                             // 고정 시뮬레이션 간격

const NAMES = ['천둥번개','질풍노도','흑진주','황금날개','바람의검','불꽃심장','새벽별','은빛질주',
               '폭풍전야','태양의아들','설원의왕','붉은혜성','청룡','백호','주작','현무',
               '무적함대','대지의노래','빛의속도','밤의제왕','강철심장','영원한승자','하늘길','북극성'];
const JOCKEYS = ['김기수','박정우','이승민','최민호','정하늘','오세훈','한지훈','류태민','문성진','장현우','서동원','조민수'];
export const SILKS = ['#ffffff','#111111','#e63946','#1d4ed8','#facc15','#16a34a','#f97316','#ec4899'];
export const SILK_TEXT = ['#111','#fff','#fff','#fff','#111','#fff','#111','#fff'];
const COATS = ['#5b3a1e','#2b2b2b','#8b5a2b','#c9a36b','#3f2a14','#a0522d','#6b4423','#d9d9d9','#7a4a2a','#4a3728'];
export const STYLES = [
  { k: '도주', early: 0.075, late: -0.065 },
  { k: '선행', early: 0.035, late: -0.03 },
  { k: '선입', early: -0.015, late: 0.025 },
  { k: '추입', early: -0.055, late: 0.08 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 출주마 생성 (시드로 결정) */
function createHorses(seed) {
  const R = makeRng(seed);
  const names = R.shuffle(NAMES).slice(0, HORSE_COUNT);
  const coats = R.shuffle(COATS);
  const horses = [];
  for (let i = 0; i < HORSE_COUNT; i++) {
    horses.push({
      idx: i, num: i + 1, name: names[i], jockey: R.pick(JOCKEYS), weight: 52 + R.int(0, 6),
      speed: R.range(0.93, 1.07), stamina: R.range(0.85, 1.15), start: R.range(0.3, 1.0), spirit: R.range(0.3, 1.0),
      style: R.pick(STYLES), silk: SILKS[i], silkText: SILK_TEXT[i], coat: coats[i], lane: i,
      // 동적 상태 (px: 이전 스텝 위치 — 렌더 보간용)
      x: GATE_X, px: GATE_X, v: 0, gait: R.range(0, Math.PI * 2), pgait: 0,
      noise: 1, noiseTarget: 1, burst: 0, fade: 0,
      swing: R.range(0, Math.PI * 2), swingRate: Math.PI * 2 / R.range(3, 6),
      finished: false, finishTime: null,
    });
  }
  const strengths = horses.map(h => Math.pow(h.speed * 0.65 + h.stamina * 0.25 + h.start * 0.06 + 0.04, 9));
  const sum = strengths.reduce((a, b) => a + b, 0);
  horses.forEach((h, i) => {
    h.pgait = h.gait;
    h.winProb = strengths[i] / sum;
    h.oddsWin = Math.max(1.3, Math.round((0.82 / h.winProb) * 10) / 10);
    const placeProb = clamp(h.winProb * 2.6 + 0.05, 0.08, 0.92);
    h.oddsPlace = Math.max(1.1, Math.round((0.82 / placeProb) * 10) / 10);
  });
  return horses;
}

export function createRace(seed) {
  const s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  return {
    seed: s,
    horses: createHorses(s),
    rng: makeRng((s ^ 0x9e3779b9) >>> 0),   // 경주 진행용 난수 (출주마 생성과 분리)
    time: 0,            // 경주 시간 (슬로모션 반영)
    realTime: 0,        // 실제 경과 시간 (step 누적)
    steps: 0,
    finishOrder: [],    // 도착 순서 (idx)
    leaderIdx: -1,
    stretch: false,
    slowMo: false,
    timeScale: 1,
    gateOpen: 0,
    done: false,
  };
}

/** 한 스텝 진행. dt는 실제 시간(초). 이벤트 배열을 반환. */
export function step(race, dt) {
  const E = [];
  race.realTime += dt;
  race.steps++;
  race.gateOpen = Math.min(1, race.gateOpen + dt * 4);
  const horses = race.horses;
  horses.forEach(h => { h.px = h.x; h.pgait = h.gait; });

  if (race.done) {
    horses.forEach(h => { h.v = Math.max(0, h.v - 90 * dt); h.x += h.v * dt; h.gait += dt * Math.PI * 2 * 2.4 * (h.v / BASE_V); });
    return E;
  }

  const R = race.rng;
  const sdt = dt * race.timeScale;
  race.time += sdt;
  const leadX = Math.max(...horses.map(h => h.x));
  const arrived = [];

  horses.forEach(h => {
    if (h.finished) { h.v = Math.max(50, h.v - 100 * sdt); h.x += h.v * sdt; return; }
    const p = (h.x - GATE_X) / TRACK_LEN;

    if (R.chance(sdt * 1.5)) h.noiseTarget = 1 + R.range(-0.04, 0.04) * h.spirit;
    h.noise += (h.noiseTarget - h.noise) * Math.min(1, sdt * 2);

    // 기복 파동: 말마다 다른 주기로 치고 나갔다 처졌다를 반복
    h.swing += sdt * h.swingRate;
    const wave = Math.sin(h.swing) * 0.055 * (0.5 + h.spirit * 0.7);

    // 스퍼트: 확률적으로 발생, 끝나면 잠시 숨 고르기
    if (h.burst > 0) { h.burst -= sdt; if (h.burst <= 0) h.fade = R.range(0.6, 1.2); }
    else if (h.fade > 0) h.fade -= sdt;
    else if (R.chance(sdt * (p > 0.6 ? 0.55 : 0.25) * (0.5 + h.spirit))) h.burst = R.range(0.7, 1.6);

    let mult = h.speed * h.noise * (1 + wave);
    const early = clamp(1 - p / 0.4, 0, 1), late = clamp((p - 0.55) / 0.3, 0, 1);
    mult *= 1 + h.style.early * early + h.style.late * late;
    if (p < 0.12) mult *= 0.9 + h.start * 0.16;
    if (p > 0.65) mult *= 0.84 + h.stamina * 0.16;
    if (h.burst > 0) mult *= 1.085;
    else if (h.fade > 0) mult *= 0.975;
    // 슬립스트림 / 선두 바람 저항
    const drafting = horses.some(o => o !== h && Math.abs(o.lane - h.lane) <= 1 && o.x - h.x > 30 && o.x - h.x < 110);
    if (drafting) mult *= 1.03;
    if (h.x >= leadX - 1) mult *= 0.985;
    // 추격 본능 (집단 유지), 막판엔 더 강하게
    const gap = clamp((leadX - h.x) / 300, 0, 1);
    mult *= 1 + gap * (0.08 + (p > 0.7 ? 0.05 : 0));

    const targetV = BASE_V * mult;
    const accel = p < 0.05 ? 300 : 120;
    h.v += clamp(targetV - h.v, -accel * sdt, accel * sdt);
    h.x += h.v * sdt;

    if (h.x >= FINISH_X) {
      h.finished = true;
      h.finishTime = race.time - (h.x - FINISH_X) / h.v;
      arrived.push(h);
    }
  });
  // 같은 스텝에 여러 마리가 들어오면 보간된 기록 순으로 착순 결정
  arrived.sort((a, b) => a.finishTime - b.finishTime).forEach(h => {
    race.finishOrder.push(h.idx);
    E.push({ type: 'finish', idx: h.idx, rank: race.finishOrder.length });
  });

  const runners = horses.filter(h => !h.finished).sort((a, b) => b.x - a.x);
  const lead = horses.reduce((a, b) => (a.x > b.x ? a : b));
  const leadRemainM = Math.max(0, (FINISH_X - lead.x) / PX_PER_METER);

  if (!race.stretch && leadRemainM <= STRETCH_M) { race.stretch = true; E.push({ type: 'stretch' }); }

  if (race.finishOrder.length === 0 && runners.length && runners[0].idx !== race.leaderIdx) {
    E.push({ type: 'lead', idx: runners[0].idx, prev: race.leaderIdx });
    race.leaderIdx = runners[0].idx;
  }

  // 사진 판정 슬로모션
  race.slowMo = false;
  if (race.finishOrder.length < 2 && runners.length >= 2) {
    const l = runners[0], s = runners[1];
    if (FINISH_X - l.x < 140 && l.x - s.x < 34) race.slowMo = true;
  }
  race.timeScale += ((race.slowMo ? 0.28 : 1) - race.timeScale) * Math.min(1, dt * 12);

  horses.forEach(h => { h.gait += sdt * Math.PI * 2 * 2.4 * (h.v / BASE_V); });

  if (race.finishOrder.length === HORSE_COUNT) {
    race.done = true; race.timeScale = 1;
    E.push({ type: 'done' });
  }
  return E;
}

/** 실제 경과 시간이 target초가 될 때까지 고정 간격으로 진행. 스텝 사이 보간 계수(0~1)를 반환. */
export function advanceTo(race, targetRealTime, onEvents) {
  const target = Math.floor(targetRealTime / STEP + 1e-6);
  while (race.steps < target) {
    const ev = step(race, STEP);
    if (onEvents && ev.length) onEvents(ev);
  }
  return clamp((targetRealTime - race.steps * STEP) / STEP, 0, 1);
}

/** 결과 요약 (호스트가 공유 저장소에 기록) */
export function summarize(race) {
  return {
    seed: race.seed,
    order: race.finishOrder.slice(),
    times: race.finishOrder.map(i => Math.round(race.horses[i].finishTime * 100) / 100),
  };
}

/** 시드로 결과만 빠르게 계산 (검증/정산 재계산용) */
export function simulateResult(seed) {
  const r = createRace(seed);
  while (!r.done && r.steps < 60 * 180) step(r, STEP);
  return summarize(r);
}

// 마신 차 표기 (1마신 ≈ 2.4m)
export function marginLabel(px) {
  const L = px / PX_PER_METER / 2.4;
  if (L < 0.08) return '코';
  if (L < 0.2) return '머리';
  if (L < 0.4) return '목';
  if (L < 0.75) return '½';
  if (L < 1.25) return '1';
  if (L < 1.75) return '1½';
  if (L < 2.5) return '2';
  if (L < 3.5) return '3';
  return Math.round(L) + '';
}
export function marginText(px) {
  const l = marginLabel(px);
  return ['코', '머리', '목'].includes(l) ? `${l} 차이` : `${l}마신 차`;
}
export const timeGapPx = sec => sec * BASE_V;
