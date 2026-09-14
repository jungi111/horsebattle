// 웹오디오 합성 사운드: 출발 벨, 말발굽, 관중 함성
let audio = null;
let muted = false;

export function init() {
  if (audio) { if (audio.ac.state === 'suspended') audio.ac.resume(); return; }
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const crowd = ac.createBufferSource(); crowd.buffer = buf; crowd.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.5;
    const crowdGain = ac.createGain(); crowdGain.gain.value = 0;
    crowd.connect(bp); bp.connect(crowdGain); crowdGain.connect(master); crowd.start();
    audio = { ac, master, crowdGain, buf };
  } catch { audio = null; }
}

export function setCrowd(level) { if (audio) audio.crowdGain.gain.setTargetAtTime(level, audio.ac.currentTime, 0.25); }

export function hoof() {
  if (!audio) return;
  const { ac, buf, master } = audio;
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
  const g = ac.createGain(); const t = ac.currentTime;
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + 0.09);
}

export function bell() {
  if (!audio) return;
  const { ac, master } = audio;
  for (let i = 0; i < 3; i++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 1500;
    const t = ac.currentTime + i * 0.18;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.16);
  }
}

/** 우승 순간 관중이 왈칵 터뜨리는 함성 (지속 배경음과는 별도의 한 번짜리 스웰) */
export function roar() {
  if (!audio) return;
  const { ac, buf, master } = audio;
  const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
  const g = ac.createGain(); const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.12, t + 1.1);
  g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + 2.3);
}

/** 우승 팡파레: 상승하는 승리의 아르페지오 + 마지막 화음 */
export function fanfare() {
  if (!audio) return;
  const { ac, master } = audio;
  const notes = [523.25, 659.25, 783.99, 1046.5];   // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const t = ac.currentTime + i * 0.11;
    [{ type: 'triangle', gain: 0.14 }, { type: 'square', gain: 0.045 }].forEach(({ type, gain }) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 0.9 : 0.3));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 1);
    });
  });
  // 마지막 화음을 받쳐주는 낮은 옥타브
  const t0 = ac.currentTime + (notes.length - 1) * 0.11;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = notes[0] / 2;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.95);
}

export function setMuted(m) { muted = m; if (audio) audio.master.gain.value = m ? 0 : 1; }
export function isMuted() { return muted; }
