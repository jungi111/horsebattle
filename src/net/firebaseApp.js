// Firebase 앱 인스턴스를 한 번만 초기화해서 공유 (어댑터, 인증, 지갑이 함께 사용)
import { initializeApp, getApps } from 'firebase/app';
import { CONFIG } from '../config.js';

export function getFirebaseApp() {
  const cfg = CONFIG.firebase;
  if (!cfg.apiKey || !cfg.databaseURL) {
    throw new Error('.env.local 에 VITE_FB_API_KEY, VITE_FB_DATABASE_URL 등 Firebase 설정이 필요합니다. (.env.example 참고)');
  }
  return getApps().length ? getApps()[0] : initializeApp(cfg);
}
