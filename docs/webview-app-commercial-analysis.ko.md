# Marklog — 웹뷰 앱 출시 · 상용화 종합 분석

날짜: 2026-08-24  
대상: 라이브 https://marklog.duckdns.org 와 이 저장소 (`skps2000/memos`)  
관점: **웹뷰 셸로 스토어 출시** (이전 문서의 풀 네이티브 계획과 병행 검토)  
관련: [marklog-plan.ko.md](marklog-plan.ko.md) · [ios-native-app-plan.ko.md](ios-native-app-plan.ko.md) · [SESSION-2026-08-20.ko.md](SESSION-2026-08-20.ko.md)

이 문서는 라이브 HTTP/API 점검과 웹·서버 코드를 기준으로 한다. React SPA라 외부 페치로는 화면 본문이 거의 안 잡힌다. 동작 확인은 헬스체크, 인스턴스 프로필, 공개 메모 API, RSS, TLS, 헤더, 프론트 소스다.

---

## 0. 한 줄 결론

서버는 **살아 있고 개인 QA로 쓸 만하다.**  
그 URL을 WKWebView/WebView로만 감싸 스토어에 내면 **Apple 4.2로 거절될 가능성이 매우 높다.**  
상용화의 바른 순서는 (1) **지금 당장 비밀 유출 차단** → (2) **모바일 웹을 앱처럼 만들기** → (3) **네이티브 셸(공유·푸시·카메라·Sign in with Apple·오프라인)** 로 출시 → (4) 수익이 나온 뒤 작성기/위젯만 네이티브로 파는 것이다.

풀 SwiftUI 재구현은 패리티에 수개월이 든다. 웹뷰는 **출시 전략**이지, URL 래핑이 제품이 아니다.

---

## 1. 라이브 서버 점검 (2026-08-24)

| 항목 | 결과 |
|---|---|
| URL | https://marklog.duckdns.org |
| 헬스 | `GET /healthz` → `200 Service ready.` (~110ms) |
| TLS | Let's Encrypt, CN=`marklog.duckdns.org`, **2026-11-18 만료** (Caddy 자동갱신 전제) |
| 프록시 | Caddy, HTTP/3 `Alt-Svc` |
| 앱 | SPA 200. 라우트 `/`, `/explore`, `/auth`, `/auth/signin` 모두 HTML 셸 |
| 버전 | **`version: "dev"`, `commit: "unknown"`** — 문서의 0.30.0 바이너리가 아님. `deploy.sh`가 ldflags 없이 소스 빌드 |
| 데모 | `demo: false`, `needsSetup: false` |
| 인스턴스 URL | `https://marklog.duckdns.org` (올바름) |
| 브랜드 | 설정 타이틀 `marklog`. HTML `<title>`·manifest·아이콘은 여전히 **Memos** |
| 가입 | **`disallowUserRegistration: false`** — 누구나 가입 가능 |
| 관리자 | `users/admin` (2026-08-23 생성) |
| 공개 메모 | **22개, 전부 PUBLIC, 전부 admin** |
| RSS | `/explore/rss.xml`, `/u/admin/rss.xml` 동작 |
| 사이트맵 | 공개 메모 URL 전부 노출 |
| 보안 헤더 | **HSTS / CSP / X-Frame-Options 없음**. HTML은 `Cache-Control: no-store` |
| 하드웨어 | DO Singapore 1 vCPU / **512MB** / 10GB. 빌드는 스왑 2G (`server-setup.sh`) |
| API 지연 | 홈 ~110ms, `ListMemos pageSize=20` ~650ms (이 점검 지점 기준) |

Connect RPC는 `/memos.api.v1.InstanceService/GetInstanceProfile` 에서 정상. REST 게이트웨이 `/api/v1/instance/profile` 도 정상.

프론트는 모바일에서 **하단 탭이 없다.** `md` 이하는 햄버거 + 좌측 Sheet에 데스크톱 사이드바를 그대로 넣는다 (`MobileAppHeader` / `MobileAppSidebar`). 작성기는 홈 타임라인 상단 CodeMirror. 세이프 에어리어는 거의 없고, `viewport-fit=cover` 없음, `user-scalable=no`. PWA 메타(`apple-mobile-web-app-capable`, manifest `display: standalone`)는 있으나 **서비스 워커·오프라인 캐시 없음.**

인증: 액세스 토큰은 `localStorage`, 리프레시는 **HttpOnly `SameSite=Lax` 쿠키** + `credentials: "include"`. 같은 오리진 웹뷰에서는 동작한다. 앱이 로컬 HTML을 열고 API만 원격이면 쿠키가 3rd-party가 되어 깨진다.

### 1.1 문서와 실제의 차이

| 이전 문서 | 라이브 |
|---|---|
| Memos 0.30.0 고정 바이너리 | 소스 `dev` 빌드, 커밋 미기록 |
| QA 전용, 가입 통제  Implicit | 가입 개방, 메모 22개 전부 공개 |
| 웹은 레퍼런스만 (v1은 SwiftData) | 서버가 이미 공개 제품 URL |

`deploy.sh` / `server-setup.sh` 가 있는 것으로 보아 **드롭릿에서 GitHub `main`을 받아 프론트+Go를 빌드**하는 운영이다. 512MB에서 `pnpm release` + `go build`는 스왑에 의존한다. 상용 트래픽용이 아니다.

---

## 2. 긴급 — 비밀이 공개 메모로 올라가 있다

공개 API `GET /api/v1/memos` 와 사이트맵/RSS로 **Turso/libSQL JWT와 `libsql://…turso.io` 호스트가 그대로 읽힌다.**  
해당 공개 메모 4개: `ct2V2QdXfGY7…`, `HWQSxinX54dw…`, `56tZ58FPSjti…`, `KAftmWhN9EsD…`.

로컬 미추적 파일 `env.txt` 에도 같은 종류의 값이 있다. git에 넣지 말 것.

**오늘 할 일 (앱 이야기 전에):**

1. Turso 대시보드에서 **해당 토큰 즉시 폐기·재발급**. 유출된 JWT는 공개된 것으로 간주.
2. 위 4개 메모 **삭제 또는 PRIVATE**. RSS/사이트맵 캐시가 있으면 재기동.
3. `disallowUserRegistration = true` (초대/관리자만).
4. 기본 가시성을 PRIVATE로. 공개 탐색은 제품이 준비될 때까지 끄거나 비우기.
5. 앞으로 서버 비밀은 메모·git·스크린샷에 두지 않는다. systemd EnvironmentFile 또는 `/etc/memos.env` (권한 600).

이게 안 막히면 스토어 심사는 둘째고, DB가 외부에서 열린다.

---

## 3. 웹뷰로 출시한다는 것의 의미

이전 합의는 **웹을 네이티브로 다시 짠다** (SwiftUI + CodeMirror 섬).  
지금 질문은 **웹을 웹뷰로 담아 낸다.**

둘은 제품이 다르다.

| | URL 래핑 | 앱 같은 웹뷰 셸 | 풀 네이티브 |
|---|---|---|---|
| 공수 | 며칠 | 2–6주 (웹 모바일 개편 포함) | 수개월 |
| 기능 패리티 | 웹과 동일 | 웹과 동일 + 네이티브 부가 | 다시 구현, 빠지기 쉬움 |
| App Store 4.2 | **거의 거절** | 통과 가능 (네이티브 가치가 보여야 함) | 통과 전제 |
| Play Store | 비교적 관대, 얇으면 품질 이슈 | 무난 | 무난 |
| 손맛 | 사파리와 같음 | 탭/제스처/공유를 잘 넣으면 앱 | 최고, 비용 최고 |
| 오프라인 | 없음 | 직접 넣어야 함 | SwiftData 등 |

### 3.1 Apple — 그냥 감싸면 안 된다

[Guideline 4.2 Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/): 앱은 웹사이트를 다시 포장한 수준을 넘어야 한다. 심사 문구의 정형은 “모바일 브라우저와 충분히 다르지 않다 / HTML5 웹앱으로 배포하라” 이다.

거절을 부르는 형태:

- `WKWebView`가 `https://marklog.duckdns.org` 만 연다
- 하단 탭·스플래시·푸시·오프라인·공유 확장 없음
- DuckDNS, 타이틀 Memos, 가입 열린 개인 인스턴스처럼 보임
- Sign in with Apple 없이 외부 로그인만 (지금은 비밀번호만 — 나중에 Google/Apple을 붙이면 **Apple 로그인이 필수**)

통과에 실제로 도움이 되는 것:

- **번들된 웹**(원격 URL만 로드하지 않음) 또는 Capacitor + 로컬 `dist`
- 네이티브 **탭바 / 스플래시 / 상태바 / 키보드 회피 / 세이프 에어리어**
- **Share Extension**, 위젯, 카메라·사진 픽커, 마이크, 푸시
- 오프라인 읽기 또는 작성 큐
- Sign in with Apple
- 독자 브랜드(Marklog), 독자 도메인, 개인정보처리방침 URL
- 리뷰 계정 + 공개해도 되는 샘플 콘텐츠

Play는 웹뷰를 더 받지만, 유료·구독이면 결제·데이터 정책을 별도로 탄다. 웹뷰만으로 IAP를 우회하면 양쪽 스토어 모두 위험하다.

### 3.2 MIT와 “Memos를 팔기”

업스트림은 MIT. 상용·클로즈드 셸은 가능하고 라이선스 고지는 유지.  
다만 스토어에서 **오픈소스 웹을 껍데기만 씌운 유료 앱**으로 보이면 4.2·평점·5.2(지식재산) 시비가 난다. 표시 이름·아이콘·워드마크는 **Marklog**. usememos 로고를 그대로 쓰지 말 것.

---

## 4. 상용화 관점

### 4.1 지금 제품 상태

개인 셀프호스트 + 실험이다. 상용 백엔드가 아니다.

막는 것:

- 512MB / 스왑 빌드 / 싱글 드롭릿 SPOF
- DuckDNS (브랜드·신뢰·메일·심사용 URL로 약함)
- `dev` 빌드, 관측·백업·알림 미확인
- 가입 개방 + 공개 타임라인에 운영 메모
- 브랜드 미분리 (Memos 아이콘·manifest)
- 모바일 IA가 데스크톱 사이드바의 축소판
- 오프라인·푸시·공유 확장 없음
- 결제·약관·계정 삭제·데이터 이전 없음

### 4.2 누구에게 팔 것인가

세 층이 문서에 섞여 있다. 웹뷰 출시라면 **한 층만** 고른다.

| 층 | 설명 | 웹뷰와의 궁합 | 권고 |
|---|---|---|---|
| A. 내 서버 전용 | 이 드롭릿만 연다 | 가장 얇음. 심사에 “나만의 사이트”로 보임 | 스토어 비추. PWA 또는 TestFlight unlisted |
| B. 셀프호스트 클라이언트 | 사용자가 자기 Memos URL을 넣는다 | Moe Memos와 같은 자리. 웹뷰면 “브라우저 앱” 지적 | 네이티브 또는 강한 셸 + 서버 입력 화면이 필요 |
| C. 호스티드 Marklog | 우리가 계정·동기화·요금을 짐 | 웹뷰 출시와 맞음. 서버를 제품으로 키워야 함 | **상용 1순위** |

이전 `marklog-plan.ko.md` v1(Firebase Auth + SwiftData + iCloud, 서버는 레퍼런스)은 **C를 앱 로컬 DB로 푸는 길**이다. 웹뷰 전략은 **C를 서버에 두고 앱은 클라이언트**다. 둘을 한 마일스톤에 섞지 말 것.

**웹뷰로 가려면 v1 데이터 전제를 이렇게 바꾼다:**

- 메모 원본 = Marklog 호스트(Memos API). SwiftData는 캐시/아웃박스만.
- 로그인은 우선 비밀번호 + (스토어용) Sign in with Apple. Firebase Auth는 필수가 아님.
- iCloud 동기화는 웹뷰 1차 범위 밖.

풀 네이티브로 돌아가면 예전 전제를 다시 쓰면 된다.

### 4.3 경쟁과 차별

웹 기능 집합(타임라인, CodeMirror, 태그, 댓글, 리액션, 뷰, 첨부, 탐색)은 이미 두껍다. Moe Memos보다 기능이 많다.  
부족한 것은 **모바일 크롬, 브랜드, 신뢰, 오프라인, 캡처 속도**다.

차별은 “Memos를 앱으로”가 아니라:

1. 열자마자 적는다 (위젯/공유/FAB)
2. Markdown 손맛이 웹과 같다 (작성기를 버리지 않음)
3. 데이터는 우리 또는 사용자 서버 (노트 본문을 제3자 문서DB에 안 둠)

### 4.4 돈

웹뷰 1차는 기능 패리티가 아니라 **호스티드 구독**이 상품이다.

- Free: 기기 1, 용량 소, 공개 없음 또는 워터마크
- Pro (StoreKit 2 / Play Billing): 동기화, 첨부, 공유 링크, 다중 기기
- 셀프호스트 연결은 Pro 이후 또는 별도. 무료 앱이 임의 URL만 여는 래퍼가 되면 4.2가 다시 열린다.

512MB 드롭릿에 유료 사용자를 받지 말 것. 출시 전 최소: 관리형 Postgres 또는 백업 있는 SQLite 볼륨, 2GB+ RAM, 고정 도메인, 오프사이트 백업, 스테이징.

---

## 5. 웹뷰로 가기 전에 웹이 못 채운 구멍

스토어 셸은 아래를 숨기지 못한다. **웹을 먼저 앱처럼** 만들어야 한다.

### 5.1 앱처럼 안 보이는 점

- 하단 탭 없음 (홈 / 탐색 / 수신함 / 나 + 작성 FAB — 기존 iOS 스펙과 같음)
- 노치/홈 인디케이터: `viewport-fit=cover` + `safe-area-inset-*` 거의 없음
- `user-scalable=no` — 접근성·심사 감점
- 키보드가 작성기 툴바를 가림 (모바일 웹 고질)
- 파일 입력 / 카메라 / 마이크는 웹 권한. 웹뷰에 네이티브 픽커를 안 붙이면 iOS에서 까다로움
- 외부 링크가 웹뷰 안에 갇힐 수 있음 (SafariViewController로 빼야 함)
- 다운로드·공유 이미지가 `navigator.share` / 파일 저장에 약함
- 오프라인 시 흰 화면
- 다크 모드 `theme-color`가 라이트 고정 (`#faf9f5`)
- 브랜드: manifest `name: Memos`, 애플 터치 아이콘 = 업스트림

### 5.2 웹뷰 특유의 깨짐

- 당겨서 새로고침 vs 타임라인 스크롤
- `BroadcastChannel` 탭 동기화 — 웹뷰 단일 문서에선 무의미, 문제는 아님
- 쿠키 SameSite=Lax: **앱과 API가 같은 호스트여야** 로그인 유지. 로컬 파일 + 원격 API는 실패 → PAT 헤더 또는 Capacitor 서버 프록시
- ITP / 웹뷰 쿠키 증발 → 백그라운드 후 로그아웃처럼 보임. 셸에서 PAT를 Keychain에 미러할지 결정 필요
- 영상 범위 요청은 서버 fileserver가 Safari용으로 이미 있음. 웹뷰에서 한 번 더 확인
- `window.open`, OAuth 팝업, SSO 콜백
- 뒤로가기(Android) / 스와이프 백(iOS) vs React Router

### 5.3 서버·운영 구멍

- 가입 개방, 공개 RSS에 운영 메모
- 버전 `dev`, 릴리스 태깅 없음
- 백업·복원 런북 없음 (이 점검 범위에서 확인 못 함)
- 관측: healthz만. 에러 알림·디스크 알림 없음
- 메일/SMTP 미설정이면 비밀번호 재설정·초대가 약함
- 첨부 스토리지 기본 로컬 디스크 10GB
- libSQL 드라이버는 로컬 워킹트리에 있음. 라이브가 Turso를 쓰는지는 프로필만으로는 불명. **토큰이 공개된 이상 쓰든 안 쓰든 로테이션**

---

## 6. 권고 방향 (결정)

**채택: 호스티드 Marklog + 하이브리드 웹뷰 셸.**  
풀 네이티브는 단계 5 이후 옵션. Moe Memos 포크는 계속 하지 않음.

이유:

- 작성기·렌더·설정 패리티를 네이티브로 다시 짜는 비용이 출시보다 큼
- 웹이 이미 본체다. 셸만 네이티브로 올리면 같은 코드를 웹·iOS·안드로이드가 나눈다
- 4.2는 “웹뷰 금지”가 아니라 “브라우저와 구분되는 가치”다. 탭·공유·푸시·캡처·오프라인으로 채울 수 있다
- 기존 CodeMirror 섬 아이디어와 모순되지 않는다. 이번엔 **앱 전체가 섬**이고, 나중에 홈/위젯만 네이티브로 빼면 된다

하지 말 것:

- `SFSafariViewController`/`WKWebView(url: duckdns)` 원 파일 앱
- DuckDNS를 스토어 스크린샷 기본 URL로 사용
- 유료 기능을 웹 결제만으로 iOS에 넣기
- 비밀이 남은 공개 인스턴스를 리뷰어에게 주기

---

## 7. 로드맵

### 지금 (0–2일) — 출시 전 사고 처리

- [ ] Turso 토큰 폐기·재발급
- [ ] 유출 공개 메모 4개 삭제/비공개, RSS 확인
- [ ] 가입 잠금, 공개 타임라인 비우기
- [ ] `env.txt` 커밋 금지. 서버 시크릿은 파일 권한 600
- [ ] Let's Encrypt 갱신(Caddy) 동작 확인. 만료 2026-11-18

### 1단계 (1–2주) — 모바일 웹을 앱의 본체로

품질 게이트: **폰 사파리 / 크롬에서 홈·작성·상세가 하단 탭 앱처럼 보인다.** 웹뷰는 아직 안 만든다.

- [ ] 하단 탭: 홈 / 탐색 / 수신함 / 나 + 작성 FAB (기존 스펙)
- [ ] `viewport-fit=cover`, 세이프 에어리어, `user-scalable=no` 제거
- [ ] 작성기 키보드 회피·툴바 sticky
- [ ] 브랜드: `<title>`, manifest, 아이콘, 스플래시 색. 이름 Marklog
- [ ] 다크 `theme-color` 동기화
- [ ] 공개 인스턴스 기본값·Explore 정책 정리 (호스티드면 비로그인 Explore 제한 검토)
- [ ] 서비스 워커로 셸 오프라인 (앱 셸 + 최근 메모). 완전한 오프라인 작성은 2단계
- [ ] 배포 ldflags에 버전·커밋. `dev`/`unknown` 금지
- [ ] HSTS를 Caddy에

### 2단계 (2–4주) — 스토어용 네이티브 셸

저장소 제안: `Documents/GitHub/marklog-app` (iOS + Android, Capacitor 또는 얇은 WKWebView/Android WebView).  
웹은 이 레포 `web/` 을 `pnpm release` 로 넣는다. **원격 URL만 로드하지 않는다.** 최초 로그인 이후 API는 우리 호스트.

네이티브 최소 세트 (4.2 방어):

- [ ] 스플래시, 커스텀 아이콘, 네이티브 탭 또는 웹 탭 + 네이티브 상태바
- [ ] Sign in with Apple (호스티드 계정). 비밀번호는 병행 가능
- [ ] 카메라/사진/파일 → 첨부 업로드 (네이티브 픽커)
- [ ] Share Extension: 텍스트/URL/이미지를 새 메모로
- [ ] 푸시 (댓글·멘션). APNs / FCM
- [ ] 외부 링크는 인앱 브라우저가 아니라 시스템 브라우저
- [ ] 오프라인: 최근 타임라인 캐시, 작성 실패 시 로컬 큐
- [ ] Keychain에 리프레시/PAT 미러 (쿠키 증발 대비)
- [ ] 이용약관, 개인정보처리방침, 계정 삭제
- [ ] 리뷰 계정, 샘플 메모(비밀 없는), 고정 도메인

도메인: `marklog.app` 또는 `app.xti.…` 같은 소유 도메인. DuckDNS는 QA 별칭만.

서버: 출시 트래픽 전에 **RAM 2GB+**, 자동 백업, 스테이징. 512MB는 개발 드롭릿로 강등.

### 3단계 — 돈과 신뢰

- [ ] StoreKit 2 / Play Billing 구독. 웹과 자격 동기화
- [ ] 용량·첨부 쿼터, 남용 방지
- [ ] 법적 페이지, 지원 메일, 계정 삭제(스토어 의무)
- [ ] 크래시(선택), 업타임 알림
- [ ] 셀프호스트 URL 연결은 구독 이후 또는 설정 숨김. 1차 심사의 기본 경로는 우리 서버

### 4단계 — 네이티브로 올릴 곳만

웹뷰로 매출·리텐션이 나온 뒤에만:

- 홈 위젯, App Intents, 잠금화면
- 작성기 성능이 웹뷰에서 부족하면 CodeMirror 섬만 유지하고 타임라인은 SwiftUI/Compose
- 풀 네이티브 재작성은 기본 경로에서 뺀다

---

## 8. TODO 백로그 (우선순위)

P0 오늘

1. 유출 토큰 로테이션 + 공개 메모 회수  
2. 가입 잠금  
3. 시크릿을 메모/git에서 제거  

P1 웹을 앱처럼

4. 모바일 하단 탭 + FAB  
5. 세이프 에어리어 / 키보드 / 줌 허용  
6. Marklog 브랜드 (title, manifest, 아이콘)  
7. 릴리스 버전 심기, HSTS  
8. 공개/비공개 제품 정책  

P2 셸

9. `marklog-app` 생성, 웹 dist 번들  
10. Apple 로그인, 공유 확장, 픽커, 푸시  
11. 쿠키 대신(또는 추가로) Keychain 세션  
12. 약관·리뷰 계정·소유 도메인  

P3 상용

13. 유료 플랜과 IAP  
14. 서버 증설·백업·스테이징  
15. 셀프호스트 연결 (의도적으로 늦게)

보류

- 풀 SwiftUI 화면 재구현 (`ios-native-app-plan` 마일스톤 1–4)
- Moe Memos 포크
- Firestore에 메모 본문
- DuckDNS를 프로덕션 브랜드로 유지

---

## 9. 기존 iOS 문서와 관계

| 문서 | 이 분석 이후 |
|---|---|
| `marklog-plan.ko.md` v1 데이터 (Firebase + SwiftData + iCloud) | 웹뷰 트랙에서는 **보류**. 호스티드 API가 원본 |
| `ios-native-spec.ko.md` 탭 IA | **유지.** 웹 1단계에서 그대로 구현 |
| 작성기 CodeMirror 섬 | **유지.** 웹뷰면 섬이 앱 전체 |
| `marklog-ios` 풀 네이티브 | 4단계 이후 또는 폐기. 셸은 `marklog-app` |
| QA URL duckdns | **유지 (QA만).** 스토어 기본 서버는 이전 |

한 문장: **스펙(화면·기능)은 예전 그대로 웹에서 완성하고, 네이티브는 셸과 캡처부터 판다.**

---

## 10. 라이브 스냅샷 (참고)

```
GET /healthz                          200 Service ready.
GET /api/v1/instance/profile          version=dev commit=unknown
                                      instanceUrl=https://marklog.duckdns.org
                                      admin=users/admin needsSetup=false
GET /api/v1/instance/settings/GENERAL title=marklog
                                      disallowUserRegistration=false
GET /api/v1/memos                     22 PUBLIC, creator=admin
TLS                                   Let's Encrypt ~ 2026-11-18
```

점검에 비밀번호 로그인은 쓰지 않았다. 비로그인 공개 표면만 봤다.
