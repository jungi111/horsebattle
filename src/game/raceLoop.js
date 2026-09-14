// 프레임 루프: 공유 시각 기준으로 시뮬레이션을 따라잡고(고정 스텝 + 보간), 연출/중계/카메라를 갱신해 그린다.
import { CONFIG } from '../config.js';
import * as E from '../core/engine.js';
import { cameraTarget, laneCenterY } from '../render/renderer.js';
import { Effects } from '../render/effects.js';
import * as Audio from '../services/audio.js';
import { $ } from '../ui/dom.js';

export function startRaceLoop({ session, renderer, view }) {
  const phaseEl = $('phase'), commentEl = $('commentary');
  const fx = { stretchBanner: 0, flash: 0 };
  const effects = new Effects();   // 결승 색종이/불꽃 연출 (카메라 흔들림은 사용하지 않음)
  let camX = 0, camV = 0, lastTs = 0;
  let commentTimer = 0, hoofTimer = 0;
  let winnerT = 0;
  let prevViewPhase = null;
  let currentRace = null;

  session.addEventListener('race', e => {
    currentRace = e.detail;
    camX = 0; camV = 0; fx.stretchBanner = 0; fx.flash = 0; commentTimer = 0; winnerT = 0;
    effects.reset();
    commentEl.textContent = '';
  });
  session.addEventListener('exit', () => { currentRace = null; prevViewPhase = null; });

  function handleEvents(events) {
    const race = currentRace;
    events.forEach(ev => {
      if (ev.type === 'lead') {
        const h = race.horses[ev.idx];
        commentEl.textContent = ev.prev >= 0 ? `선두 교체! ${h.num}번 ${h.name}이(가) 치고 나갑니다!` : `${h.num}번 ${h.name}이(가) 선두로 나섭니다!`;
        commentTimer = 1.2;
      } else if (ev.type === 'stretch') {
        fx.stretchBanner = 1.6; Audio.setCrowd(0.14);
        commentEl.textContent = '최후의 직선 주로! 관중석이 들끓습니다!'; commentTimer = 1.4;
      } else if (ev.type === 'finish' && ev.rank === 1) {
        const w = race.horses[ev.idx];
        fx.flash = 0.7;
        effects.burstAtFinish(w.x, laneCenterY(w.lane), w.silk);
        Audio.roar(); Audio.fanfare();
      } else if (ev.type === 'done') {
        const w = race.horses[race.finishOrder[0]], s = race.horses[race.finishOrder[1]];
        const label = E.marginLabel(E.timeGapPx(s.finishTime - w.finishTime));
        commentEl.textContent = ['코', '머리', '목'].includes(label) ? `사진 판정! ${w.num}번 ${w.name}이(가) ${label} 차이로 우승!` : `${w.num}번 ${w.name} 우승! 기록 ${w.finishTime.toFixed(2)}초`;
        commentTimer = 999;
        Audio.setCrowd(0.12);   // 결승 직후: 환호(roar)는 별도 한 번 재생되고, 이후 배경은 살짝 들뜬 정도로 유지
      }
    });
  }

  function periodicCommentary(dt) {
    const race = currentRace;
    commentTimer -= dt;
    if (commentTimer > 0 || !race || race.done) return;
    const runners = race.horses.filter(h => !h.finished).sort((a, b) => b.x - a.x);
    if (!runners.length) return;
    const l = runners[0], second = runners[1];
    const remain = Math.round((E.FINISH_X - l.x) / E.PX_PER_METER);
    if (race.finishOrder.length > 0) {
      const w = race.horses[race.finishOrder[0]];
      commentEl.textContent = race.finishOrder.length === 1
        ? `${w.num}번 ${w.name} 1착으로 결승선 통과! 2착 경쟁은 ${l.num}번 ${l.name}이(가) 앞섭니다!`
        : `${w.num}번 ${w.name} 우승! ${race.finishOrder.length + 1}착 경쟁 중 - ${l.num}번 ${l.name}`;
    } else if (remain < E.STRETCH_M) {
      commentEl.textContent = second ? `${l.num}번 ${l.name} 선두! ${second.num}번 ${second.name}이(가) ${E.marginText(l.x - second.x)}로 맹추격!` : `${l.num}번 ${l.name} 결승선으로!`;
    } else {
      commentEl.textContent = `${l.num}번 ${l.name} 선두, ${second ? second.num + '번 ' + second.name + ' 2위 · ' : ''}남은 거리 ${remain}m`;
    }
    commentTimer = 1.2;
  }

  function frame(ts) {
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    const room = session.room, race = currentRace;

    let viewPhase = 'betting', countdown = 0, bannerText = null, alpha = 1;
    if (room && race) {
      const ph = room.phase;
      if (ph === 'lobby') {
        bannerText = session.isHost ? '게임 시작을 누르면 제1경주 출주표가 나옵니다' : '방장이 게임을 시작하길 기다리는 중';
      } else if (ph === 'betting') {
        bannerText = `제${session.no}경주 · 매 경주 ${session.betAmount.toLocaleString('ko-KR')}원 배팅 · 말을 고르세요`;
      } else if (ph === 'racing' || ph === 'result') {
        const elapsed = (session.adapter.now() - (room.race.startAt || 0)) / 1000;
        if (elapsed < 0) {
          viewPhase = 'countdown'; countdown = -elapsed - 0.7;   // 마지막 0.7초는 GO!
        } else {
          // 경주 중: 공유 시각까지 즉시 따라잡기 / 종료 후: 실시간으로만 감속 애니메이션
          const target = race.done ? Math.min(elapsed, race.realTime + dt) : Math.min(elapsed, race.realTime + 600);
          alpha = E.advanceTo(race, target, handleEvents);
          viewPhase = race.done ? 'finished' : 'racing';
        }
      }
    }

    // 상태 전이 연출
    if (viewPhase !== prevViewPhase) {
      if (viewPhase === 'countdown') { phaseEl.textContent = '출발 준비'; commentEl.textContent = '출주마들이 게이트에 들어갑니다.'; Audio.setCrowd(0.03); }
      if (viewPhase === 'racing' && prevViewPhase !== 'finished') {
        Audio.bell(); Audio.setCrowd(0.07);
        if (race.realTime < 1) { commentEl.textContent = '출발했습니다!'; commentTimer = 1.5; }
      }
      if (viewPhase === 'finished') { winnerT = 0; view.renderResult(); session.writeResultIfHost(); }
      prevViewPhase = viewPhase;
    }

    if (viewPhase === 'racing') {
      periodicCommentary(dt);
      hoofTimer -= dt;
      if (hoofTimer <= 0 && !document.hidden) { Audio.hoof(); hoofTimer = 0.1 + Math.random() * 0.05; }
      const lead = race.horses.reduce((a, b) => (a.x > b.x ? a : b));
      const remainM = Math.max(0, (E.FINISH_X - lead.x) / E.PX_PER_METER);
      if (race.stretch && race.finishOrder.length === 0) Audio.setCrowd(0.14 + (1 - remainM / E.STRETCH_M) * 0.12);
      phaseEl.textContent = `경주 중 · ${race.time.toFixed(1)}s · ${Math.round(E.RACE_METERS - remainM)}m`;
    } else if (viewPhase === 'finished') {
      winnerT += dt;
      phaseEl.textContent = '경주 종료';
      session.writeResultIfHost();
    } else if (viewPhase === 'betting' && room) {
      phaseEl.textContent = room.phase === 'lobby' ? `대기 중 · ${Object.keys(session.players).length}명 참가` : `배팅 접수 중 · 제${session.no}경주`;
      commentEl.textContent = room.phase === 'betting' ? '말을 고르고 배팅을 확정하세요.' : '친구들에게 초대 링크를 보내세요.';
    }

    // 카메라: 선두 그룹을 속도 완충을 두고 부드럽게 추적
    if (race) {
      if (viewPhase === 'racing' || viewPhase === 'finished') {
        const target = cameraTarget(race, alpha);
        const desiredV = (target - camX) * 2.2;
        camV += (desiredV - camV) * Math.min(1, dt * 2.5);
        camX += camV * dt;
      } else { camX += (0 - camX) * Math.min(1, dt * 4); camV = 0; }
    }
    fx.stretchBanner = Math.max(0, fx.stretchBanner - dt);
    fx.flash = Math.max(0, fx.flash - dt * 3);
    effects.update(dt);

    if (race) {
      const b = session.myBet;
      renderer.draw(race, {
        camX, t: ts, alpha, phase: viewPhase, countdown, bannerText,
        myBetIdx: b ? b.horse : (room && room.phase === 'betting' ? view.selectedIdx : -1),
        stretchBanner: fx.stretchBanner, flash: fx.flash, winnerT, effects,
        winner: race.done ? race.horses[race.finishOrder[0]] : null,
      });
    }
    schedule();
  }

  function schedule() {
    if (document.hidden) setTimeout(() => frame(performance.now()), 250);   // 숨김 탭: 낮은 주기로 상태 유지
    else requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastTs = performance.now(); });
  schedule();
}
