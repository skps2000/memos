# Marklog 계획 총정리

2026-08-20. 이 파일이 **현재 합의된 구현 전제**다. 세부는 아래 문서로.

| 문서 | 내용 |
|---|---|
| [SESSION-2026-08-20.ko.md](SESSION-2026-08-20.ko.md) | 서버, 경로, 세션 이어가기 |
| [ios-native-app-plan.ko.md](ios-native-app-plan.ko.md) | 제품·단계·결정 |
| [ios-native-spec.ko.md](ios-native-spec.ko.md) | 메뉴, iOS 스펙, 라이브러리 후보 |
| [ios-ui-ux.ko.md](ios-ui-ux.ko.md) | 디자인/UI/UX 선정 기준 |
| [ios-libraries.ko.md](ios-libraries.ko.md) | 패키지 표 + GitHub 링크 |

앱 코드 저장소는 아직 없다. 착수 시 `Documents/GitHub/marklog-ios`.

---

## 제품

**Marklog** — 이 레포 Memos 웹(`web/`)의 **모바일 사용성·기능을 빼지 않고** 네이티브 iOS로 다시 만드는 상용 앱.

- 비교 대상: 폰으로 연 https://marklog.duckdns.org 와 http://localhost:3001
- **Moe Memos는 목표가 아님** (축소판 서드파티, MPL, 스토어 4.1)
- 표시 이름 Marklog. 번들 id 제안 `com.xti.marklog`

### v1 데이터 · 로그인 (확정)

| | |
|---|---|
| 로그인 | **Firebase Auth만.** Sign in with Apple 필수. 구글은 선택. |
| 메모 원본 | **SwiftData** 로컬 DB |
| 기기간 동기화 | **CloudKit / iCloud** (Apple ID). 구글 로그인으로는 메모가 복원되지 않음 |
| 안 붙임 | Firestore에 메모, Turso, Crashlytics/FCM/Analytics(출시 전 선택), connect-swift(셀프호스트 때) |

웹 Memos 서버는 v1에서 메모 저장소가 아니다. 화면·작성기 패리티의 **레퍼런스**다. 셀프호스트 연결은 이후 마일스톤.

---

## 지금 돌아가는 서버

| | |
|---|---|
| 공개 | **https://marklog.duckdns.org/** |
| 기기 | DigitalOcean SGP 512MB, `178.128.53.74` |
| SSH | `ssh -i ~/.ssh/mpt_do root@178.128.53.74` |
| 스택 | Memos 0.30.0 `:5230` + Caddy 443 (Let's Encrypt) + DuckDNS 5분 갱신 |
| 로컬 개발 | http://localhost:3001 → API `:8081`, 데이터 `.data/memos_demo.db` |

512MB는 QA·개인용. 유료 다수 클라우드에는 나중에 더 큰 서버.

---

## 메뉴 (웹 1:1, 빼지 않음)

아이폰: 탭 **홈 / 탐색 / 수신함 / 나** + 작성 **FAB 시트**.

나: 프로필, 첨부, 뷰, 보관, 설정(웹 섹션 그대로), 계정, 정보.

아이패드: 웹과 같은 3열 스플릿.

설정 사용자: 계정, 토큰, 환경설정, 웹훅, 태그.  
설정 관리자(서버 연결 후): 멤버, 시스템, 메모, 스토리지, 알림, SSO, AI, 통계.

---

## 디자인 / UI / UX

1. 레퍼런스 1순위 = **이 제품 모바일 웹**. Dribbble·Moe Memos·애플 메모 안 봄.
2. 크롬만 HIG (탭, 시트, 키보드). 메모 카드는 웹 카드.
3. UI 프레임워크 = **SwiftUI만**. SwiftUIX 등 전체 키트 없음.
4. 작성기 = 웹 **CodeMirror 6 섬** (WKWebView). Runestone은 대안일 뿐.
5. 색 = `web/src/themes/COLOR_GUIDE.md` OKLCH → Asset 토큰.
6. 아이콘 = SF Symbols ↔ Lucide 매핑. Lucide 폰트 패키지 안 씀.
7. 착수 시 폰 웹 캡처를 `DesignRef/`에 두고 시뮬레이터와 나란히 리뷰.

UI 보강 패키지: Introspect, WrappingHStack, Pow(저장/삭제/고정만).

---

## v1 SPM (눈 검수용 링크)

1. https://github.com/firebase/firebase-ios-sdk — **Auth 모듈만**
2. https://github.com/google/GoogleSignIn-iOS
3. https://github.com/gonzalezreal/textual
4. https://github.com/kean/Nuke
5. https://github.com/kishikawakatsumi/KeychainAccess
6. https://github.com/hmlongco/Factory
7. https://github.com/elai950/AlertToast
8. https://github.com/smittytone/HighlighterSwift

작성기는 SPM이 아니라 이 레포 `web/src/components/MemoEditor/Editor`.

---

## 구현 단계

| 단계 | 내용 | 완료 |
|---|---|---|
| 0 | `marklog-ios` 프로젝트, Firebase Auth, SwiftData 골격 | 로그인 + 빈 타임라인 |
| 1 | 홈 + 작성기 패리티 | 웹과 저장 Markdown·렌더가 같음. **여기 전 다음 화면 금지** |
| 2 | 상세: 댓글, 리액션, 관계, 아웃라인, 공유, 위치 | |
| 3 | 탐색, 보관, 첨부, 수신함, 뷰, 프로필 | |
| 4 | 설정 | 서버 없는 항목 먼저 |
| 5 | 공유 확장, 위젯, iCloud 동기화 다듬기 | |
| 6 | (이후) 셀프호스트 Memos API, 또는 유료 클라우드 | |

품질 게이트: 같은 본문을 웹 작성기와 앱 작성기에 넣었을 때 저장 문자열이 같고, 타임라인에서 태그·체크·코드·이미지가 웹과 같이 보이면 1단계 통과.

---

## 바로 다음

`Documents/GitHub/marklog-ios` 생성 후 단계 0+1.
