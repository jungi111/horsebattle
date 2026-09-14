// 결승 연출용 파티클 시스템 (색종이 · 불꽃놀이 스파크 · 확산 링). 게임 로직과 무관한 순수 시각 효과.
// 카메라 흔들림(화면 떨림)은 절대 추가하지 않는다 — 위치는 고정, 색/빛/입자만으로 화려함을 낸다.
const CONFETTI_COLORS = ['#f5c542', '#ec4899', '#4ade80', '#38bdf8', '#f97316', '#a78bfa', '#ffffff'];

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(a)})`;
}

export class Effects {
  constructor() { this.reset(); }

  reset() {
    this.confetti = [];   // 화면 위에서 쏟아지는 색종이 (화면 좌표, 카메라 영향 없음)
    this.sparks = [];     // 결승선에서 터지는 불꽃 파편 (트랙 좌표, 카메라 따라 이동)
    this.rings = [];      // 결승선에서 확산하는 링 (트랙 좌표)
  }

  /** 결승선을 통과하는 순간 그 자리에서 불꽃이 터지고 화면 위로 색종이가 쏟아진다. */
  burstAtFinish(wx, y, color) {
    for (let i = 0; i < 3; i++) {
      this.rings.push({ wx, y, maxR: 60 + i * 32, life: 0, dur: 0.55 + i * 0.15, delay: i * 0.09, color: i === 1 ? '#ffffff' : color });
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.25;
      const sp = 100 + Math.random() * 160;
      this.sparks.push({
        wx, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0, dur: 0.55 + Math.random() * 0.55,
        color: Math.random() < 0.55 ? color : '#ffd54a', size: 2 + Math.random() * 2.4,
      });
    }
    for (let i = 0; i < 90; i++) {
      this.confetti.push({
        x: Math.random() * 1000, y: -20 - Math.random() * 260,
        vx: (Math.random() - 0.5) * 50, vy: 70 + Math.random() * 100,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 7,
        w: 5 + Math.random() * 4, h: 8 + Math.random() * 6,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 0, dur: 2.8 + Math.random() * 1.6,
      });
    }
  }

  update(dt) {
    if (dt <= 0) return;
    for (const p of this.confetti) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 55 * dt; p.rot += p.vr * dt; }
    this.confetti = this.confetti.filter(p => p.life < p.dur && p.y < 640);
    for (const p of this.sparks) { p.life += dt; p.wx += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= Math.max(0, 1 - dt * 1.4); }
    this.sparks = this.sparks.filter(p => p.life < p.dur);
    for (const r of this.rings) { if (r.delay > 0) r.delay -= dt; else r.life += dt; }
    this.rings = this.rings.filter(r => r.delay > 0 || r.life < r.dur);
  }

  /** camX: 현재 카메라 x (트랙 좌표 입자를 화면 좌표로 변환하는 데 사용) */
  draw(ctx, camX) {
    for (const r of this.rings) {
      if (r.delay > 0) continue;
      const p = clamp01(r.life / r.dur), rad = r.maxR * easeOutCubic(p);
      ctx.strokeStyle = withAlpha(r.color, (1 - p) * 0.9);
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(r.wx - camX, r.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of this.sparks) {
      const a = 1 - p.life / p.dur;
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.beginPath(); ctx.arc(p.wx - camX, p.y, p.size * a + 0.6, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of this.confetti) {
      const a = p.life < p.dur - 0.6 ? 1 : Math.max(0, (p.dur - p.life) / 0.6);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
}
