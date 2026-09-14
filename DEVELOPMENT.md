# Horse Battle — 개발 문서

이 문서는 개발/운영용입니다. 게임 소개와 플레이 방법은 [README.md](README.md)를 보세요.

친구들과 각자 기기에서 같은 경주를 보며 배팅하는 웹 게임. 서버 코드 없이 정적 파일만으로 동작하며,
방 상태는 어댑터(로컬 / Firebase)로 공유하고, 회원 인증과 잔고(지갑)는 서비스 계층이 가진다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 엔진 결정성 · 정산 · 비밀번호 해시 테스트
npm run build    # dist/ 생성
```

## 구조

```
index.html                Vite 진입점 (마크업)
src/
  main.js                 부트스트랩: 서비스 → 세션 → 화면
  config.js               설정 (VITE_* 환경변수로 덮어쓰기 가능)
  core/                   순수 로직 (DOM 없음, 테스트 대상)
    rng.js                시드 난수 (mulberry32)
    engine.js             결정적 경주 시뮬레이션: 같은 시드 = 같은 결과
    settlement.js         배팅 금액 상수, 적중 판정, 정산 계산
  game/
    session.js            방 상태 ↔ 지갑 연결, 방장/배팅 액션
    raceLoop.js           프레임 루프: 고정 스텝 따라잡기 + 보간, 연출, 중계, 카메라
  render/
    renderer.js           캔버스 렌더러 (DPR 대응, 배경 레이어 캐시, 결승 연출)
    horse.js              말·기수 프로시저럴 드로잉, 막판 스퍼트 부스터/우승 후광
    effects.js            색종이·불꽃놀이 파티클 (결승 연출 전용, 카메라 흔들림 없음)
  net/
    adapter.js            어댑터 인터페이스 + 팩토리 + applyPatch
    local.js              로컬 어댑터 (같은 브라우저 탭 간 동기화, 테스트용)
    firebase.js           Firebase Realtime Database 어댑터
  services/
    auth.js               회원 인증: LocalAuth(PBKDF2 해시) / FirebaseAuth
    account.js            회원 지갑: LocalWallet / FirestoreWallet(Cloud Firestore users/{uid} 트랜잭션)
    crypto.js             PBKDF2-SHA256 해시, SHA-256
    audio.js              합성 사운드
  ui/
    login.js, lobby.js, room.js   화면 렌더/이벤트
    dom.js                헬퍼
  styles/main.css
tests/                    node --test (엔진 결정성, 정산, 비밀번호 해시)
scripts/seed-members.mjs  Firebase 에 회원 계정 생성
database.rules.json       Realtime Database 보안 규칙 (rooms)
firestore.rules           Cloud Firestore 보안 규칙 (users)
.github/workflows/deploy.yml   main push → 빌드 → GitHub Pages
```

## 게임 규칙 (엔진 관점)

- 방을 만들 때 **1회 배팅 금액**을 1,000 / 5,000 / 10,000원 중 하나로 정한다. 그 방의 모든 경주는 그 금액으로 배팅한다.
- 참가자는 매 경주 말과 단승(1착) / 연승(3착 이내)만 고른다.
- 배팅 카드의 **자동 ON/OFF** 스위치: ON이면 방장이 출발할 때까지 말을 고르지 않아도 무작위 말에 단승으로 자동 배팅된다(잔고가 있을 때). OFF면 말을 고르지 않은 경주는 배팅 없이 관전한다. 설정은 방 참가자 정보(`players/{pid}/autoBet`)와 브라우저에 저장된다.
- 방장이 **게임 시작 → 배팅 마감·출발 → 다음 경주**를 진행한다. 방장이 나가면 먼저 들어온 참가자가 방장을 이어받는다.

## 동작 원리

- 경주는 **시드**만 공유하면 모든 기기에서 똑같이 재생된다. 방장이 출발을 누르면 `race.startAt`(출발 시각)이 기록되고, 각 기기는 그 시각을 기준으로 같은 시드의 경주를 고정 간격(1/60초)으로 진행한다. 늦게 들어온 기기나 잠시 멈춘 탭도 공유 시각까지 즉시 따라잡는다.
- 화면은 스텝 사이를 보간해 그리므로 시뮬레이션 간격과 화면 주사율이 달라도 끊기지 않는다.
- 정산은 방장 기기가 `results/{no}` 에 한 번 기록하고, 각 참가자 기기는 자기 몫을 **지갑**에 반영한다(같은 경주는 한 번만).

## 회원과 잔고

첫 화면은 **회원 로그인**이다. 로그인 후 방을 만들거나 코드로 참가한다. 초대 링크(`?room=CODE`)로 들어오면 로그인 직후 그 방으로 자동 입장한다.

- 인증: `services/auth.js` — 로컬 모드는 브라우저 저장소에 PBKDF2-SHA256(10만 회, 솔트) 해시로 회원을 저장하고, Firebase 모드는 Firebase Authentication(이메일/비밀번호)을 쓴다. 아이디는 내부적으로 `m-<sha256(아이디)>@horsebattle.app` 이메일로 매핑되므로 한글 아이디도 된다.
- 지갑: `services/account.js` — 로컬 모드는 `localStorage`, Firebase 모드는 **Cloud Firestore** `users/{uid}` 문서(프로필 + 잔고만)를 트랜잭션으로 갱신한다. 회원 문서에는 경주별 기록을 남기지 않는다.
- 중복 정산 방지: 경주 정산은 `settle(net)` 로 잔고에 더해지는데, 같은 경주를 두 번 반영하지 않도록 방(room, Realtime Database)의 `results/{no}/settledBy/{pid}` 플래그를 어댑터의 `claim()` 으로 원자적으로 선점한 뒤에만 지갑에 반영한다.
- 방 상태(실시간 동기화)는 **Realtime Database** `rooms/{code}` 를 쓴다. Firebase 는 비밀번호 6자 이상만 받으므로 사용자가 입력한 비밀번호는 아이디와 함께 SHA-256 으로 늘려 Firebase 비밀번호로 쓰고, Firebase 가 다시 자체 해시(scrypt)로 저장한다.
- 방의 `players/{pid}/balance` 는 표시용 미러이고 진짜 잔고는 항상 지갑이다.
- `CONFIG.rescueBelowBet` 가 켜져 있으면 잔고가 배팅액 미만일 때 다음 경주에서 초기 잔고로 복구된다. 운영 시에는 끈다.

## 로컬 테스트

`adapter: 'local'` 상태에서는 같은 브라우저의 탭끼리만 동기화된다. 로그인 세션은 탭 단위라 탭마다 다른 회원으로 들어갈 수 있다. 최초 실행 시 테스트 회원 몇 명이 자동으로 만들어진다(`services/auth.js` 의 `SEED_MEMBERS` 참고).

1. `npm run dev` 후 접속 → 로그인 → 배팅 금액 선택 → **방 만들기**
2. 새 탭에서 초대 링크로 접속 → 다른 회원으로 로그인 → 자동 입장
3. 방장 탭에서 **게임 시작** → 각 탭에서 말 선택 → 방장이 **배팅 마감·출발!**

## GitHub Pages 배포

1. 저장소에 push (`main` 브랜치).
2. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 선택.
3. `.github/workflows/deploy.yml` 이 자동으로 빌드·배포한다. 주소: `https://<계정>.github.io/<저장소>/`

`vite.config.js` 의 `base: './'` 덕분에 저장소 이름이 무엇이든 상대 경로로 동작한다.

## Firebase 연결

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성.
2. **Authentication → 시작하기 → 로그인 방법 → 이메일/비밀번호** 사용 설정.
3. **Realtime Database** 생성(방 상태용) → 규칙 탭에 `database.rules.json` 붙여넣기.
   **Cloud Firestore** 생성(회원 프로필·지갑용) → 규칙 탭에 `firestore.rules` 붙여넣기.
4. 프로젝트 설정 → 내 앱 → 웹 앱 추가 → SDK 설정값을 `.env.local` 에 입력 (`.env.example` 복사). **이 파일은 절대 커밋하지 않는다** (`.gitignore` 에 이미 막혀 있음):
   ```
   VITE_ADAPTER=firebase
   VITE_FB_API_KEY=...
   VITE_FB_AUTH_DOMAIN=<project>.firebaseapp.com
   VITE_FB_DATABASE_URL=https://<project>-default-rtdb.<region>.firebasedatabase.app
   VITE_FB_PROJECT_ID=<project>
   VITE_FB_APP_ID=...
   ```
5. 회원 계정 생성: `scripts/members.example.json` 을 복사해 `scripts/members.json` 으로 만들고 실제 아이디/비밀번호로 채운다 (**이 파일도 절대 커밋하지 않는다**, `.gitignore` 에 이미 막혀 있음). 그 다음:
   ```bash
   npm run seed:members                      # scripts/members.json 의 회원 전부 생성
   node scripts/seed-members.mjs 아이디 비번   # 한 명만 추가
   ```
6. `npm run dev` 로 로그인 → 방 만들기 → 다른 기기에서 참가 → 경주 한 번 확인.
7. GitHub Pages 배포 시 같은 값을 저장소 **Settings → Secrets and variables → Actions** 에 등록하면 워크플로가 빌드에 넣는다.

Firebase 코드는 동적 import 로 분리되어 있어 로컬 모드 번들에는 포함되지 않는다.

## 방 데이터 구조

```
rooms/{code}
  code, hostId, createdAt, betAmount
  phase    'lobby' | 'betting' | 'racing' | 'result'
  race     { no, seed, startAt }
  players  { pid: { name, balance, joinedAt, autoBet } }    // pid = 회원 uid, balance 는 표시용 미러
  bets     { no: { pid: { horse, type, amount, odds, auto? } } }
  results  { no: { seed, order[], times[], payouts: { pid: { rank, hit, pay, net } }, settledBy: { pid: true } } }
```

Cloud Firestore `users/{uid}` 문서:
```
{ username, name, createdAt, balance }
```

Realtime Database 는 숫자 키(경주 번호)가 있는 객체를 배열로 돌려주므로 `bets[no]`, `results[no]` 는 인덱스 접근으로 읽는다.

## 보안 관련 주의

- `.env.local` (Firebase 설정)과 `scripts/members.json` (실제 회원 비밀번호)은 절대 커밋하지 않는다. 실수로 커밋했다면 `.gitignore` 에 추가하는 것만으로는 부족하고, 해당 커밋 자체를 히스토리에서 제거(`git commit --amend` 또는 `git filter-repo`)한 뒤 강제 푸시하고, 노출된 계정 비밀번호는 즉시 새 값으로 바꿔야 한다.
- Realtime Database 규칙은 로그인한 회원이면 누구나 모든 방을 읽고 쓸 수 있다(친구끼리 쓰는 걸 전제로 한 느슨한 규칙). Firestore 규칙은 본인 지갑만 읽고 쓸 수 있다.

## 알려진 제한

- 정산은 방장 기기가 기록하고 각 참가자가 자기 지갑에 반영한다. 조작 방지가 필요해지면 Cloud Functions 가 `results` 를 검증해 지갑을 갱신하도록 옮긴다(`core/engine.js` 의 `simulateResult(seed)` 와 `core/settlement.js` 재사용).
- 방은 자동 삭제되지 않는다.
- 회원가입 화면은 없다. 회원은 시드 스크립트로 만든다.
