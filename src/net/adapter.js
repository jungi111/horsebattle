// 방 상태 공유 어댑터 인터페이스와 팩토리.
//
//   connect(): Promise<void>
//   now(): number                          // ms epoch (서버 시간 보정 포함)
//   createRoom(code, room): Promise<void>  // 이미 있으면 reject
//   getRoom(code): Promise<room|null>
//   subscribe(code, cb): () => void        // 즉시 1회 + 변경 시마다 cb(room|null)
//   update(code, patch): Promise<void>     // { 'players/abc/balance': 900 } 멀티패스 갱신, null 이면 삭제
//   claim(code, path): Promise<boolean>    // path 값이 아직 true 가 아니면 원자적으로 true 로 바꾸고 true 반환(선점 성공), 이미 true 면 false
import { CONFIG } from '../config.js';

/** Firebase update() 와 같은 멀티패스 패치를 객체에 적용 */
export function applyPatch(obj, patch) {
  Object.entries(patch).forEach(([path, value]) => {
    const keys = path.split('/').filter(Boolean);
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(value));
  });
  return obj;
}

export async function createAdapter() {
  if (CONFIG.adapter === 'firebase') {
    const { FirebaseAdapter } = await import('./firebase.js');
    return new FirebaseAdapter(CONFIG.firebase);
  }
  const { LocalAdapter } = await import('./local.js');
  return new LocalAdapter();
}
