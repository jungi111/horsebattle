// 캔버스 렌더러: 엔진 상태(race) + 화면 상태(view)를 받아 그린다. 게임 로직 없음.
// - 스텝 사이 보간(alpha)으로 프레임 끊김 제거
// - 기기 픽셀 비율(DPR) 대응으로 선명하게
// - 관중석 등 정적 레이어는 오프스크린 캔버스에 캐시
import * as E from '../core/engine.js';
import { drawHorse } from './horse.js';

export const W = 1000, H = 560;
export const TRACK_TOP = 110, TRACK_BOTTOM = 470;
export const LANE_H = (TRACK_BOTTOM - TRACK_TOP) / E.HORSE_COUNT;
const CAM_MAX = E.FINISH_X + 560 - W;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = v => clamp(v, 0, 1);
const easeOutBack = t => { const c = 1.7; return 1 + c * Math.pow(t - 1, 3) + Math.pow(t - 1, 2) * (c + 1); };

/** 말/파티클이 서는 레인의 화면 y (draw() 에서 말을 그릴 때 쓰는 값과 동일) */
export const laneCenterY = lane => TRACK_TOP + lane * LANE_H + LANE_H / 2 + 5;

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 보간된 월드 x (스텝 사이 위치) */
export const lerpX = (h, alpha) => h.px + (h.x - h.px) * alpha;
const lerpGait = (h, alpha) => h.pgait + (h.gait - h.pgait) * alpha;

/** 카메라 목표: 선두와 선두 그룹(상위 4마리) 평균을 섞어 튀지 않게 */
export function cameraTarget(race, alpha = 1) {
  const xs = race.horses.map(h => lerpX(h, alpha)).sort((a, b) => b - a);
  const mean = (xs[0] + xs[1] + xs[2] + xs[3]) / 4;
  const focus = xs[0] * 0.55 + mean * 0.45;
  return clamp(focus - W * 0.6, 0, CAM_MAX);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.layers = {};
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr === this.dpr && this.canvas.width === W * dpr) return;
    this.dpr = dpr;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr;
    this.layers = {};
  }

  /** 하늘 + 관중석 (정적) */
  _bgLayer() {
    if (this.layers.bg) return this.layers.bg;
    const c = document.createElement('canvas'); c.width = W * this.dpr; c.height = 90 * this.dpr;
    const g = c.getContext('2d'); g.scale(this.dpr, this.dpr);
    const sky = g.createLinearGradient(0, 0, 0, 90);
    sky.addColorStop(0, '#7fb7e6'); sky.addColorStop(1, '#cfe6f7');
    g.fillStyle = sky; g.fillRect(0, 0, W, 90);
    g.fillStyle = '#5c6270'; g.fillRect(0, 40, W, 8);
    g.fillStyle = '#8d8f99'; g.fillRect(0, 48, W, 42);
    return (this.layers.bg = c);
  }

  /** 관중 패턴 (주기 84px) */
  _crowdPattern() {
    if (this.layers.crowd) return this.layers.crowd;
    const period = 84;
    const c = document.createElement('canvas'); c.width = period * this.dpr; c.height = 42 * this.dpr;
    const g = c.getContext('2d'); g.scale(this.dpr, this.dpr);
    const colors = ['#e74c3c','#3498db','#f1c40f','#ecf0f1','#9b59b6','#2ecc71'];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < period; i += 14) {
        g.fillStyle = colors[Math.floor((i / 14 + r * 3) % 6)];
        g.beginPath(); g.arc(i + 7, 12 + r * 11, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
    const pat = this.ctx.createPattern(c, 'repeat-x');
    // 패턴은 DPR 배율로 그려졌으므로 축소 행렬 적용
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / this.dpr));
    return (this.layers.crowd = pat);
  }

  /**
   * view = { camX, t(ms), alpha(0~1), phase: 'betting'|'countdown'|'racing'|'finished',
   *          countdown, bannerText, myBetIdx, stretchBanner, flash, winner }
   */
  draw(race, view) {
    const ctx = this.ctx, { camX, t, alpha } = view;
    this._t = t;   // 리더보드 등 미세한 펄스 연출에서 재사용
    const horses = race.horses;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 하늘/관중석
    ctx.drawImage(this._bgLayer(), 0, 0, W, 90);
    const excited = view.phase === 'racing' && race.stretch;
    ctx.save();
    ctx.translate(-((camX * 0.15) % 84), 48 + (excited ? Math.sin(t * 0.008) * 1.5 : 0));
    ctx.fillStyle = this._crowdPattern();
    ctx.fillRect(0, 0, W + 84, 42);
    ctx.restore();

    // 잔디 / 더트
    ctx.fillStyle = '#3f9a45'; ctx.fillRect(0, 90, W, TRACK_TOP - 90);
    ctx.fillStyle = '#3a8f40'; ctx.fillRect(0, TRACK_BOTTOM, W, H - TRACK_BOTTOM);
    if (!this.layers.dirt) {
      const d = ctx.createLinearGradient(0, TRACK_TOP, 0, TRACK_BOTTOM);
      d.addColorStop(0, '#b98a5a'); d.addColorStop(1, '#a5764a');
      this.layers.dirt = d;
    }
    ctx.fillStyle = this.layers.dirt; ctx.fillRect(0, TRACK_TOP, W, TRACK_BOTTOM - TRACK_TOP);

    // 레인 구분선 + 번호
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    ctx.setLineDash([70, 30]); ctx.lineDashOffset = -camX % 100;
    ctx.beginPath();
    for (let i = 1; i < E.HORSE_COUNT; i++) { const y = TRACK_TOP + i * LANE_H; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let m = 100; m < E.RACE_METERS; m += 200) {
      const sx = E.GATE_X + m * E.PX_PER_METER - camX;
      if (sx < -20 || sx > W + 20) continue;
      for (let i = 0; i < E.HORSE_COUNT; i++) ctx.fillText(i + 1, sx, TRACK_TOP + (i + 0.5) * LANE_H);
    }

    // 거리 표지
    for (let m = 200; m < E.RACE_METERS; m += 200) {
      const sx = E.GATE_X + m * E.PX_PER_METER - camX;
      if (sx < -40 || sx > W + 40) continue;
      const remain = E.RACE_METERS - m;
      ctx.fillStyle = '#eee'; ctx.fillRect(sx - 1, TRACK_TOP - 44, 3, 36);
      ctx.fillStyle = remain === 400 ? '#e63946' : '#1d4ed8';
      ctx.beginPath(); ctx.arc(sx, TRACK_TOP - 48, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif';
      ctx.fillText(remain, sx, TRACK_TOP - 48);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, TRACK_TOP); ctx.lineTo(sx, TRACK_BOTTOM); ctx.stroke();
    }

    this._gate(E.GATE_X - camX, race.gateOpen);
    this._finish(E.FINISH_X - camX);
    if (excited) this._speedLines(t);

    this._innerRail(camX);
    const racing = view.phase === 'racing';
    const winnerIdx = race.finishOrder.length ? race.finishOrder[0] : -1;
    [...horses].sort((a, b) => a.lane - b.lane).forEach(h => {
      const x = lerpX(h, alpha), sx = x - camX;
      if (sx < -90 || sx > W + 90) return;
      drawHorse(ctx, h, {
        sx, cy: laneCenterY(h.lane), x, gait: lerpGait(h, alpha), t, racing,
        myBet: view.myBetIdx === h.idx, isWinner: h.idx === winnerIdx,
      });
    });
    this._outerRail(camX);
    this._minimap(horses, alpha);

    if (racing || view.phase === 'finished') this._leaderboard(horses, alpha, winnerIdx);
    this._overlays(race, view);
    if (view.effects) view.effects.draw(ctx, camX);   // 색종이/불꽃: 항상 맨 위에
  }

  _innerRail(camX) {
    const ctx = this.ctx, yi = TRACK_TOP - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, TRACK_TOP, W, 3);
    for (let x = -(camX % 96) - 96; x < W + 96; x += 96) {
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(x - 2, yi - 16, 4, 24);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, yi - 16, 2, 24);
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, yi - 14, W, 5); ctx.fillRect(0, yi - 3, W, 5);
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, yi - 9, W, 1); ctx.fillRect(0, yi + 2, W, 1);
  }

  _outerRail(camX) {
    const ctx = this.ctx, yo = TRACK_BOTTOM + 6;
    for (let x = -(camX % 96) - 48; x < W + 96; x += 96) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 1, yo + 12, 6, 3);
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(x - 2, yo - 2, 4, 26);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, yo - 2, 2, 26);
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, yo, W, 6); ctx.fillRect(0, yo + 12, W, 6);
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, yo + 6, W, 1); ctx.fillRect(0, yo + 18, W, 1);
  }

  _speedLines(t) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const y = TRACK_TOP + ((i * 97) % (TRACK_BOTTOM - TRACK_TOP));
      const x = W - ((t * 2.1 + i * 141) % (W + 220));
      ctx.moveTo(x, y); ctx.lineTo(x + 90 + (i % 3) * 34, y);
    }
    ctx.stroke();
    // 금빛 스트릭을 듬성듬성 섞어 직선 주로를 더 화려하게
    ctx.strokeStyle = 'rgba(245,197,66,0.16)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const y = TRACK_TOP + ((i * 151 + 40) % (TRACK_BOTTOM - TRACK_TOP));
      const x = W - ((t * 2.6 + i * 233) % (W + 260));
      ctx.moveTo(x, y); ctx.lineTo(x + 130, y);
    }
    ctx.stroke();
  }

  _gate(sx, gateOpen) {
    if (sx < -120 || sx > W + 20) return;
    const ctx = this.ctx;
    for (let i = 0; i < E.HORSE_COUNT; i++) {
      const y = TRACK_TOP + i * LANE_H;
      ctx.fillStyle = '#2f3542'; ctx.fillRect(sx - 70, y + 2, 66, LANE_H - 4);
      ctx.fillStyle = '#57606f'; ctx.fillRect(sx - 68, y + 4, 62, LANE_H - 8);
      ctx.save(); ctx.translate(sx - 4, y + 2); ctx.rotate(-gateOpen * Math.PI * 0.5);
      ctx.fillStyle = '#dfe4ea'; ctx.fillRect(0, 0, 4, LANE_H - 4);
      ctx.restore();
      ctx.fillStyle = E.SILKS[i]; ctx.fillRect(sx - 66, y + LANE_H / 2 - 9, 18, 18);
      ctx.fillStyle = E.SILK_TEXT[i]; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, sx - 57, y + LANE_H / 2);
    }
    ctx.fillStyle = '#2f3542'; ctx.fillRect(sx - 72, TRACK_TOP - 52, 70, 26);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('START', sx - 37, TRACK_TOP - 39);
  }

  _finish(sx) {
    if (sx < -60 || sx > W + 60) return;
    const ctx = this.ctx, cell = 8;
    for (let y = TRACK_TOP; y < TRACK_BOTTOM; y += cell) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = ((y / cell + c) % 2 === 0) ? '#fff' : '#111';
        ctx.fillRect(sx - 8 + c * cell, y, cell, cell);
      }
    }
    ctx.fillStyle = '#e63946'; ctx.fillRect(sx - 3, TRACK_TOP - 74, 6, 66);
    ctx.fillStyle = '#fff'; ctx.fillRect(sx - 3, TRACK_TOP - 74, 6, 10);
    ctx.fillStyle = '#e63946'; ctx.fillRect(sx - 3, TRACK_TOP - 54, 6, 10);
    ctx.fillStyle = '#111'; ctx.fillRect(sx - 40, TRACK_TOP - 100, 80, 24);
    ctx.fillStyle = '#f5c542'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', sx, TRACK_TOP - 88);
  }

  _leaderboard(horses, alpha, winnerIdx) {
    const ctx = this.ctx;
    const sorted = [...horses].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return lerpX(b, alpha) - lerpX(a, alpha);
    });
    const x = W - 196, y = 6, w = 190, rowH = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, w, rowH * 4 + 10);
    for (let i = 0; i < 4; i++) {
      const h = sorted[i]; if (!h) continue; const ry = y + 5 + i * rowH;
      const isChampion = winnerIdx >= 0 && h.idx === winnerIdx;
      if (isChampion) {
        ctx.fillStyle = `rgba(245,197,66,${0.22 + Math.sin(this._t * 0.005) * 0.08})`;
        ctx.fillRect(x + 1, ry - 6, w - 2, rowH);
      }
      ctx.fillStyle = isChampion ? '#f5c542' : '#ccc'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, x + 6, ry + 8);
      ctx.fillStyle = h.silk; ctx.fillRect(x + 18, ry + 1, 14, 14);
      ctx.fillStyle = h.silkText; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(h.num, x + 25, ry + 8);
      ctx.fillStyle = isChampion ? '#fff8e1' : '#fff'; ctx.font = (isChampion ? 'bold ' : '') + '11px sans-serif'; ctx.textAlign = 'left';
      const spark = h.burst > 0 && !h.finished && (E.FINISH_X - h.x) / E.PX_PER_METER < E.STRETCH_M;
      ctx.fillText(h.name + (spark ? ' ⚡' : '') + (isChampion ? ' 🏆' : ''), x + 38, ry + 8);
      if (i > 0) {
        const prev = sorted[i - 1];
        const gapPx = h.finished && prev.finished ? E.timeGapPx(h.finishTime - prev.finishTime) : lerpX(prev, alpha) - lerpX(h, alpha);
        ctx.fillStyle = '#f5c542'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(E.marginLabel(gapPx), x + w - 6, ry + 8);
      }
    }
  }

  _minimap(horses, alpha) {
    const ctx = this.ctx, mx = 20, my = H - 52, mw = W - 40, mh = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#f5c542'; ctx.fillRect(mx + mw - 3, my, 3, mh);
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('S', mx + 4, my + mh / 2); ctx.textAlign = 'right'; ctx.fillText('F', mx + mw - 6, my + mh / 2);
    horses.forEach(h => {
      const p = clamp((lerpX(h, alpha) - E.GATE_X) / E.TRACK_LEN, 0, 1);
      const px = mx + 14 + p * (mw - 30);
      const py = my + 5 + (h.lane / (E.HORSE_COUNT - 1)) * (mh - 10);
      ctx.fillStyle = h.silk; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }

  _overlays(race, view) {
    const ctx = this.ctx, t = view.t;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (view.phase === 'countdown') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      const going = view.countdown <= 0;
      const pulse = going ? 1.15 + Math.sin(t * 0.03) * 0.05 : 1 + (1 - (view.countdown % 1)) * 0.12;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 20); ctx.scale(pulse, pulse);
      ctx.shadowColor = going ? 'rgba(245,197,66,0.9)' : 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 26;
      ctx.fillStyle = going ? '#f5c542' : '#fff'; ctx.font = 'bold 96px sans-serif';
      ctx.fillText(going ? 'GO!' : Math.ceil(view.countdown), 0, 0);
      ctx.restore();
    } else if (view.phase === 'betting') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(W / 2 - 220, 20, 440, 44);
      ctx.fillStyle = '#f5c542'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText(view.bannerText || '배팅 접수 중 · 출발 전 말을 고르세요', W / 2, 42);
    } else if (view.phase === 'finished' && view.winner) {
      this._winnerBanner(view.winner, view.winnerT || 0);
    }
    if (view.phase === 'racing' && view.stretchBanner > 0) this._stretchBanner(view.stretchBanner, t);
    if (view.phase === 'racing' && race.slowMo) this._photoFinishBanner(t);
    if (view.flash > 0) {
      const g = ctx.createRadialGradient(W / 2, TRACK_TOP + 90, 0, W / 2, TRACK_TOP + 90, W * 0.75);
      g.addColorStop(0, `rgba(255,250,220,${view.flash})`);
      g.addColorStop(1, `rgba(255,220,120,0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  /** 최후의 직선 주로 배너: 숨쉬듯 맥박치는 붉은 띠 (위치는 고정, 크기/투명도만 변한다 — 흔들림 없음) */
  _stretchBanner(remain, t) {
    const ctx = this.ctx;
    const a = Math.min(1, remain * 2.2);           // 마지막 순간에만 서서히 사라짐
    const pulse = 1 + Math.sin(t * 0.012) * 0.045;  // 은은한 숨쉬기 애니메이션
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = `rgba(200,20,30,${0.85 * a})`; ctx.fillRect(-W / 2, -40, W, 80);
    ctx.fillStyle = `rgba(255,210,80,${0.55 * a})`; ctx.fillRect(-W / 2, -41, W, 3);
    ctx.fillStyle = `rgba(255,210,80,${0.55 * a})`; ctx.fillRect(-W / 2, 38, W, 3);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.font = 'bold 42px sans-serif';
    ctx.fillText('🔥 최후의 직선 주로!', 0, 0);
    ctx.restore();
  }

  /** 포토피니시 배너: 카메라 아이콘이 통통 튀고 금빛 테두리가 숨쉬듯 빛난다 */
  _photoFinishBanner(t) {
    const ctx = this.ctx;
    const glow = 0.5 + Math.sin(t * 0.02) * 0.3;
    const bounce = Math.abs(Math.sin(t * 0.012)) * 4;
    ctx.save();
    ctx.translate(W / 2, H - 90 - bounce);
    ctx.shadowColor = `rgba(245,197,66,${glow})`; ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; roundRectPath(ctx, -140, -20, 280, 40, 10); ctx.fill();
    ctx.strokeStyle = `rgba(245,197,66,${0.6 + glow * 0.3})`; ctx.lineWidth = 2;
    roundRectPath(ctx, -140, -20, 280, 40, 10); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('📸 PHOTO FINISH', 0, 0);
    ctx.restore();
  }

  /** 우승 배너: 튕기듯 팝인 + 회전하는 금빛 광선 + 살짝 통통 튀는 트로피 */
  _winnerBanner(w, elapsed) {
    const ctx = this.ctx;
    const popDur = 0.5;
    const pop = elapsed < popDur ? Math.max(0, easeOutBack(clamp01(elapsed / popDur))) : 1;
    const bob = Math.sin(elapsed * 5) * 2;
    const cx = W / 2, cy = 48;
    ctx.save();
    ctx.translate(cx, cy);

    // 회전하는 금빛 광선 (천천히 회전, 흔들림 아님 — 배경 장식)
    ctx.save();
    ctx.rotate(elapsed * 0.35);
    ctx.globalAlpha = 0.3 + Math.sin(elapsed * 3) * 0.06;
    for (let i = 0; i < 10; i++) {
      ctx.rotate(Math.PI / 5);
      const g = ctx.createLinearGradient(0, 0, 0, -150);
      g.addColorStop(0, 'rgba(245,197,66,0.55)'); g.addColorStop(1, 'rgba(245,197,66,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, -150); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.scale(pop, pop);
    const bw = 490, bh = 58;
    ctx.shadowColor = 'rgba(245,197,66,0.65)'; ctx.shadowBlur = 20 + Math.sin(elapsed * 4) * 5;
    ctx.fillStyle = 'rgba(8,8,12,0.9)';
    roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2;
    roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.stroke();

    ctx.fillStyle = '#f5c542'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`🏆 ${w.num}번 ${w.name} 우승  ${w.finishTime.toFixed(2)}s`, 0, bob);
    ctx.restore();
  }
}
