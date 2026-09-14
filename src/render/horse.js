// 말 + 기수 프로시저럴 드로잉 (갤럽 사이클 애니메이션)
import { BASE_V, FINISH_X, PX_PER_METER, STRETCH_M } from '../core/engine.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shadeCache = new Map();
function shade(hex, amt) {
  const key = hex + amt;
  if (shadeCache.has(key)) return shadeCache.get(key);
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  const out = `rgb(${r},${g},${b})`;
  shadeCache.set(key, out);
  return out;
}

// 다리 하나: 관절 2개 (각도는 수직 아래 기준, +면 앞쪽)
function drawLeg(ctx, x0, y0, a1, a2, L1, L2, color, w) {
  const jx = x0 + Math.sin(a1) * L1, jy = y0 + Math.cos(a1) * L1;
  const hx = jx + Math.sin(a2) * L2, hy = jy + Math.cos(a2) * L2;
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(jx, jy); ctx.stroke();
  ctx.lineWidth = w * 0.7; ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#1a1512'; ctx.beginPath(); ctx.ellipse(hx + 1, hy + 1, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
}

const LEG_PHASE = { hindFar: 0, hindNear: 0.9, frontFar: 3.1, frontNear: 4.0 };

/** 막판 스퍼트 부스터: 후광 + 속도 잔상 + 불꽃 궤적 + 불티 (말 뒤, 몸통보다 먼저 그림) */
function drawBoost(ctx, t, color, speedRatio) {
  const k = t * 0.02;
  // 은은하게 맥박치는 후광 (말 전체를 감싸는 따뜻한 빛)
  const haloR = 34 + Math.sin(k * 3) * 3;
  const halo = ctx.createRadialGradient(-4, -2, 4, -4, -2, haloR);
  halo.addColorStop(0, 'rgba(255,200,90,0.35)');
  halo.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(-4, -2, haloR, 0, Math.PI * 2); ctx.fill();
  // 속도 잔상 (몸통 실루엣이 뒤로 번지는 느낌) — 색상을 두 가지로 섞어 더 화려하게
  for (let i = 1; i <= 4; i++) {
    ctx.globalAlpha = 0.2 - i * 0.04;
    ctx.fillStyle = i % 2 ? color : '#ffd54a';
    ctx.beginPath(); ctx.ellipse(-i * 13, -2, 27, 9, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 불꽃 궤적: 뒤로 길게 뻗는 선 (주황 → 노랑), 굵기/개수를 늘려 더 화려하게
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = -14 + i * 3.6 + Math.sin(k + i * 1.7) * 2.4;
    const len = 46 + ((k * 10 + i * 19) % 46) * speedRatio;
    const g = ctx.createLinearGradient(-26, 0, -26 - len, 0);
    g.addColorStop(0, 'rgba(255,245,170,0.9)');
    g.addColorStop(0.45, 'rgba(255,130,30,0.55)');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.strokeStyle = g; ctx.lineWidth = i % 3 === 0 ? 3.5 : 2;
    ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(-26 - len, y + (i - 4) * 1.3); ctx.stroke();
  }
  // 불티 (더 많이, 더 넓게 흩날림)
  for (let i = 0; i < 9; i++) {
    const ph = (k * 0.65 + i * 0.29) % 1;
    const px = -30 - ph * 75, py = -8 + Math.sin(i * 2.1 + k) * 12 * ph;
    ctx.globalAlpha = 1 - ph;
    ctx.fillStyle = i % 3 === 0 ? '#fff3c4' : 'rgba(255,190,70,0.9)';
    ctx.beginPath(); ctx.arc(px, py, 2.6 - ph * 1.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 번개 표시 (펄스)
  const boltScale = 1 + Math.sin(k * 5) * 0.12;
  ctx.save(); ctx.translate(4, -42 + Math.sin(k * 2) * 2); ctx.scale(boltScale, boltScale);
  ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,213,74,0.9)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffd54a'; ctx.fillText('⚡', 0, 0);
  ctx.restore();
}

/** 결승선을 통과한 우승마에게 계속 남는 은은한 금빛 후광 + 반짝이는 별가루 */
function drawChampionGlow(ctx, t) {
  const k = t * 0.003;
  const r = 30 + Math.sin(k * 2.4) * 2.5;
  const halo = ctx.createRadialGradient(0, -2, 3, 0, -2, r);
  halo.addColorStop(0, 'rgba(245,197,66,0.32)');
  halo.addColorStop(1, 'rgba(245,197,66,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, -2, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = k * 1.6 + i * (Math.PI / 2);
    const rr = 22 + Math.sin(k * 3 + i) * 4;
    const px = Math.cos(a) * rr, py = -4 + Math.sin(a) * rr * 0.45;
    const tw = 0.4 + Math.abs(Math.sin(k * 4 + i * 2)) * 0.6;
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * @param ctx
 * @param h 말
 * @param p { sx, cy, x(월드 보간 위치), gait(보간), t(ms), racing(bool), myBet(bool), isWinner(bool) }
 */
export function drawHorse(ctx, h, p) {
  const { sx, cy, t } = p;
  const moving = h.v > 5;
  const speedRatio = clamp(h.v / BASE_V, 0, 1.3);
  const g = p.gait;
  const bob = moving ? -Math.sin(g + 1.9) * 2 * speedRatio : 0;
  const pitch = moving ? Math.sin(g + 0.4) * 0.04 * speedRatio : 0;
  const coat = h.coat, dark = shade(coat, -40), darker = shade(coat, -70);
  const inStretch = p.racing && (FINISH_X - p.x) / PX_PER_METER < STRETCH_M && !h.finished;

  const boosting = inStretch && h.burst > 0 && moving;

  ctx.save();
  ctx.translate(sx, cy);
  if (boosting) drawBoost(ctx, t, h.silk, speedRatio);
  if (p.isWinner && h.finished) drawChampionGlow(ctx, t);
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 20, 34 + (moving ? Math.abs(Math.sin(g)) * 4 : 0), 5, 0, 0, Math.PI * 2); ctx.fill();
  // 먼지
  if (moving && speedRatio > 0.5) {
    ctx.fillStyle = 'rgba(190,150,100,0.4)';
    for (let i = 0; i < 4; i++) {
      const px = -30 - i * 11 - ((t * 0.06 + i * 9) % 24), py = 14 + Math.sin(t * 0.01 + i * 2) * 4 - i * 2;
      ctx.beginPath(); ctx.arc(px, py, 5 - i, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.translate(0, bob);
  ctx.rotate(pitch);

  const legAngles = (ph, hind) => {
    if (!moving) return [hind ? -0.08 : 0.05, hind ? -0.04 : 0.05];
    const s = Math.sin(g + ph), c = Math.cos(g + ph);
    const swing = (hind ? 0.62 : 0.68) * speedRatio;
    const a1 = s * swing + (hind ? -0.12 : 0.08);
    const flex = clamp(c, 0, 1) * (hind ? 1.05 : 1.35) * speedRatio;
    return [a1, hind ? a1 + flex : a1 - flex];
  };
  const hipX = -17, hipY = 3, shX = 14, shY = 3;

  // 먼 쪽 다리
  let a = legAngles(LEG_PHASE.hindFar, true);  drawLeg(ctx, hipX - 3, hipY, a[0], a[1], 11.5, 11, darker, 5);
  a = legAngles(LEG_PHASE.frontFar, false);    drawLeg(ctx, shX + 3, shY, a[0], a[1], 11.5, 11, darker, 5);

  // 꼬리
  const tw = moving ? Math.sin(g + 2.5) * 5 : 0;
  ctx.strokeStyle = darker; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-27, -7); ctx.quadraticCurveTo(-40, -6 + tw, -44, 6 + tw * 0.5); ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-27, -6); ctx.quadraticCurveTo(-38, -2 + tw, -42, 10 + tw * 0.5); ctx.stroke();

  // 몸통: 엉덩이 + 배 + 가슴
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.ellipse(-16, -3, 13, 10.5, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -1, 24, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(15, -2, 11, 9.5, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(0, 4, 20, 4.5, 0, 0, Math.PI); ctx.fill();

  // 목과 머리 (달릴 때 끄덕임)
  const nod = moving ? Math.sin(g + 1.2) * 0.1 * speedRatio : 0;
  ctx.save();
  ctx.translate(14, -6); ctx.rotate(nod);
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(16, -22); ctx.lineTo(24, -14); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = darker; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const mx = -1 + i * 5, my = -7 - i * 4.5;
    const wav = moving ? Math.sin(g + i) * 2 : 0;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - 5 + wav, my - 4); ctx.stroke();
  }
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.ellipse(24, -19, 10, 5.8, 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(32, -15, 4, 3.2, 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(19, -25); ctx.lineTo(21, -32); ctx.lineTo(24, -25); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(16, -24); ctx.lineTo(17, -30); ctx.lineTo(20, -24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(24, -22, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(21, -17); ctx.lineTo(29, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, -24); ctx.lineTo(29, -12); ctx.stroke();
  ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(29, -12); ctx.quadraticCurveTo(12, -6, -4, -10); ctx.stroke();
  ctx.restore();

  // 가까운 쪽 다리
  a = legAngles(LEG_PHASE.hindNear, true);   drawLeg(ctx, hipX, hipY, a[0], a[1], 11.5, 11, coat, 5.5);
  a = legAngles(LEG_PHASE.frontNear, false); drawLeg(ctx, shX, shY, a[0], a[1], 11.5, 11, coat, 5.5);

  // 안장 깔개(게이트 번호색) + 번호 + 안장
  ctx.fillStyle = h.silk; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(8, -9); ctx.lineTo(9, 5); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = h.silkText; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(h.num, -2, -1);
  ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.ellipse(-1, -9, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

  // 기수
  const jb = moving ? Math.sin(g + 1.9) * 1.2 : 0;
  ctx.save(); ctx.translate(-2, -12 + jb);
  ctx.strokeStyle = '#f3f3f3'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 5); ctx.lineTo(1, 10); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.fillRect(-1, 9, 5, 3);
  ctx.fillStyle = h.silk; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(6, -8, 10, 5.5, -0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const whip = inStretch ? Math.sin(t * 0.03) : 0;
  ctx.strokeStyle = h.silk; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(18, -4); ctx.stroke();
  if (inStretch) {
    ctx.save(); ctx.translate(8, -12); ctx.rotate(-1.2 + whip * 0.9);
    ctx.strokeStyle = h.silk; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(14, -16, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = h.silk; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(13.5, -18, 5, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.fillRect(14, -17, 5, 2);
  ctx.restore();
  ctx.restore();

  if (p.myBet) {
    ctx.fillStyle = '#f5c542'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▼', sx, cy - 44 + bob);
  }
}
