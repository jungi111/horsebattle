// 앱 설정. 환경변수(VITE_*)가 있으면 우선 적용된다 (.env.local 에 두면 커밋되지 않음, .env.example 참고).
const env = import.meta.env || {};

export const CONFIG = {
  // 'local'    : 회원/지갑/방 모두 브라우저 저장소 (혼자 여러 탭으로 테스트)
  // 'firebase' : Firebase Authentication + Realtime Database
  adapter: env.VITE_ADAPTER || 'local',

  // Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성
  firebase: {
    apiKey: env.VITE_FB_API_KEY || '',
    authDomain: env.VITE_FB_AUTH_DOMAIN || '',
    databaseURL: env.VITE_FB_DATABASE_URL || '',
    projectId: env.VITE_FB_PROJECT_ID || '',
    appId: env.VITE_FB_APP_ID || '',
  },

  startBalance: 10000,        // 회원 지갑이 아직 없을 때 초기 잔고
  rescueBelowBet: true,       // 잔고가 배팅액 미만이면 다음 경주에 초기 잔고로 복구 (테스트용, 운영 시 false)
  countdownSec: 4,            // 출발 버튼 후 카운트다운 (기기 간 시계 차이 흡수용 여유 포함)
};
