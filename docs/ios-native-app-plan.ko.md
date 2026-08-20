# 네이티브 iOS 앱 계획

**총정리:** [marklog-plan.ko.md](marklog-plan.ko.md) · 세션: [SESSION-2026-08-20.ko.md](SESSION-2026-08-20.ko.md) · 메뉴·라이브러리: [ios-native-spec.ko.md](ios-native-spec.ko.md)

**스펙은 Moe Memos가 아니다. 스펙은 지금 로컬에서 돌아가는 이 저장소의 Memos 웹앱이다.**

앱 이름: **Marklog**. Moe Memos 포크가 아니다.

## 한 줄

로컬 `http://localhost:3001` Memos(이 레포 `web/`, API 0.30)를 **기능 누락 없이** 네이티브 iOS 앱 Marklog로 다시 구현한다. Moe Memos는 참고용 서드파티 축소판일 뿐, 벤치마크 목표가 아니다.

계정 모드는 유지한다.

1. **로컬** — 기기 SwiftData. 서버 없음. 웹과 같은 기능 집합을 온디바이스로.
2. **셀프호스트** — 사용자 Memos URL. QA는 `https://marklog.duckdns.org` 및 로컬 `:8081`.
3. **호스티드 클라우드(이후, 유료)** — 우리가 운영하는 Memos 0.30. Firebase Auth.

메모 본문은 Firestore에 두지 않는다. 원본은 웹과 동일하게 Memos API다.

---

## 왜 Moe Memos를 버리나

Moe Memos는 별도 앱이다. 트윗처럼 빨리 적기·오프라인에 최적화돼 있고, 이 웹앱의 상당 기능을 빼거나 늦게 따라간다.

로컬 웹에 있고 Moe Memos에 없거나 약한 것:

- CodeMirror 장식 소스 Markdown 편집기 (태그 자동완성, 포커스 모드, 툴바, 음성 녹음, 자동저장)
- 댓글 스레드, 리액션, 메모 간 관계(링크)
- 위치 / 지도, 모션 포토, 링크 미리보기, Mermaid, KaTeX
- 받은편지함 (댓글·멘션)
- 저장 뷰(Views), 첨부 라이브러리
- 공개범위 PRIVATE / PROTECTED / PUBLIC
- 탐색(Explore), 공유 링크, 이미지로 공유
- 설정 전 범위: 계정, PAT, 웹훅, 멤버, 인스턴스, 스토리지, SSO, 태그 색, AI 전사, 알림
- 사이드바 태그 트리, 통계 캘린더, 다열 피드, 아웃라인

그래서 Moe Memos를 따라가면 **기능이 현저히 떨어진 다른 앱**이 된다. 목적은 그 반대다.

---

## 포팅의 의미

웹 DOM을 WKWebView로 감싸지 않는다. 요청은 네이티브다.

**완벽한 포팅 = 기능·정보구조·작성 경험의 패리티.**  
크롬(탭, 시트, 네비)만 iOS 관례를 따른다. 기능 생략으로 단순화하지 않는다.

웹 `web/src`가 수용 기준이다. 화면이 웹과 픽셀 단위로 같을 필요는 없다. **웹에서 할 수 있는 일을 앱에서 못 하면 미완이다.**

### 웹 라우트 → iOS (누락 금지)

| 웹 | iOS |
|---|---|
| `/` Home | 홈 타임라인 + 작성기 |
| `/explore` | 탐색 |
| `/archived` | 보관 |
| `/attachments` | 첨부 라이브러리 |
| `/inbox` | 받은편지함 |
| `/views` | 저장 뷰 |
| `/setting` | 설정 (basic + admin 섹션) |
| `/u/:username` | 프로필 + 히트맵/지도 |
| `/memos/:uid` | 상세 (아웃라인, 댓글, 리액션, 관계, 공유) |
| `/memos/shares/:token` | 공유 메모 |
| `/auth/*` | 로그인·가입·콜백 |

### 작성기 (웹 MemoEditor와 동급)

웹은 CodeMirror 6 장식 소스 한 개다. 앱도 **원문 Markdown을 그대로 두고 스타일만 입히는** 한 개 편집기여야 한다. 미리보기 탭만 있는 축소판은 실패다.

필수: 헤딩/볼드/리스트/체크/코드/링크, `#태그` `@멘션` 자동완성, 인라인 이미지, 파일·음성, 공개범위, 위치, 포커스 모드, 자동저장, 작성 시각.

렌더: GFM, 수식, Mermaid, 링크 카드, 태스크 리스트, 신뢰 iframe 정책은 웹과 맞출 것.

---

## 구조

변경 없음. `MemoRepository` + SwiftData + Connect-Swift(`proto/api/v1`).

차이는 **클라이언트 기능 범위가 웹과 같다**는 것이다. API를 부분만 쓰지 않는다.

모바일 인증은 여전히 Keychain PAT. 쿠키 리프레시는 쓰지 않는다. (웹은 쿠키, 앱은 PAT — 서버 기능은 동일.)

---

## Firebase

변경 없음. 새 프로젝트. 크래시·분석·FCM·Remote Config. Auth는 클라우드 마일스톤. Firestore에 메모 없음.

---

## 네이티브 스택

웹 패리티 때문에 라이브러리를 더 쓴다.

| 라이브러리 | 웹 대응 |
|---|---|
| connect-swift + proto 생성 | `web/src/types/proto` + Connect |
| Runestone 또는 CodeMirror 계열 | MemoEditor / CodeMirror 6 |
| swift-markdown-ui + KaTeX + Mermaid | MemoContent 파이프라인 |
| Kingfisher | 첨부·썸네일 |
| MapKit / Leaflet 대응 | LocationPicker, UserMemoMap |
| Firebase iOS SDK | (웹에 없음 — 앱 부가) |
| StoreKit 2 | 클라우드 구독 |

---

## 단계 (패리티 순서)

기능을 빼서 빠르게 내지 않는다. 웹 화면 단위로 닫는다.

0. 프로젝트 + Firebase + proto 클라이언트. 로컬/셀프호스트 계정 골격.
1. **홈 + 작성기 패리티.** 타임라인, 다열, 필터, CodeMirror급 작성기, 첨부, 공개범위. 여기가 웹과 같아 보이기 전까지 다음으로 안 감.
2. 상세: 댓글, 리액션, 관계, 아웃라인, 공유 이미지/링크, 위치.
3. 탐색, 보관, 첨부 라이브러리, 받은편지함, 뷰, 프로필/캘린더.
4. 설정 전 섹션 (계정, PAT, 환경설정, 태그, 웹훅, 멤버, 인스턴스, 스토리지, SSO, AI, 알림).
5. 공유 확장, 위젯 — 웹에 없는 네이티브 부가. 패리티 이후.
6. 클라우드 IAP + HTTPS 호스트. 512MB 드롭릿은 QA 전용.

---

## 결정 (갱신)

1. **앱 이름 Marklog.** 스펙 = 이 레포의 Memos 웹. Moe Memos는 목표가 아님.
2. 기능 생략으로 “모바일답게” 만들지 않는다. 크롬만 네이티브.
3. 작성기는 축소된 textarea가 아니라 웹 Editor와 동급.
4. 원격 원본은 Memos 0.30 API. Firebase에 본문 없음.
5. Keychain PAT.
6. 512MB 드롭릿은 QA 전용.
7. 새 앱. Moe Memos 포크 아님 (MPL, 스토어 4.1).

## 위험

- 범위가 크다. 웹 `MemoEditor` + `MemoContent` + Settings만 해도 네이티브 수개월이다. **1단계 홈+작성기가 웹과 동급인지**를 품질 게이트로 둔다.
- Moe Memos를 열어서 비교하면 또 단순해 보이려는 유혹이 있다. 비교 대상은 **localhost:3001** 뿐이다.

## 바로 다음

새 저장소 `Documents/GitHub/marklog-ios`에서 마일스톤 0+1 착수. QA 서버는 `https://marklog.duckdns.org`. 번들 id 제안 `com.xti.marklog`.
