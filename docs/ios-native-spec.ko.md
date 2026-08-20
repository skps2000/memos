# iOS 네이티브 스펙 · 메뉴 · 스타일 · 라이브러리

세션 기록: [SESSION-2026-08-20.ko.md](SESSION-2026-08-20.ko.md) · 앱 계획: [ios-native-app-plan.ko.md](ios-native-app-plan.ko.md)

스펙 원본은 로컬 웹 `http://localhost:3001` (`web/`). Moe Memos는 비교 대상이 아니다.

항목마다 외부 라이브러리 **2–3안**을 두고, **채택안을 굵게** 표시한다. 사소한 것도 최신 패키지를 쓴다.

---

## 1. iOS 네이티브 스펙

| 항목 | 결정 |
|---|---|
| 최소 OS | **iOS 18.0** (iPadOS 18). iOS 26 Liquid Glass는 런타임 분기. |
| 기기 | iPhone + iPad. iPhone 우선 완성, iPad는 `NavigationSplitView`로 웹 사이드바 재현. |
| 언어 | Swift 6, SwiftUI, Observation (`@Observable`). UIKit은 편집기·맵·영상만. |
| 동시성 | Swift Concurrency. Combine 신규 사용 금지. |
| 패키지 | SPM only. |
| 오프라인 | SwiftData + 아웃박스. 충돌 시 새 메모. |
| 인증 | Keychain PAT. 쿠키 세션 없음. |
| 네트워크 | App Transport Security 기본 HTTPS. 셀프호스트 HTTP는 인스턴스별 예외. |
| 접근성 | Dynamic Type, VoiceOver, Reduce Motion, 대비. |
| 로케일 | 한국어 기본, 영어. 웹 `locales`와 키를 맞춤. |
| 권한 | 사진, 마이크, 위치, 알림. Info.plist 문구 한국어. |
| 확장 | Share Extension, Widget (홈/잠금), App Intents. 패리티 이후. |
| 배포 | TestFlight → App Store. 표시 이름 **Marklog**. 번들 id 제안 `com.xti.marklog` (확정은 착수 시). |

아이콘·스플래시는 웹 `logo.webp` 골든 옐로를 따르되 Memos/Moe Memos 복제로 보이지 않게 Marklog 워드마크를 둔다.

---

## 2. 메뉴 구성

웹 사이드바 + 라우트를 그대로 옮긴다. 기능을 합치거나 빼지 않는다.

### iPhone — 하단 탭 4 + 작성 FAB

웹은 사이드바다. 폰에서는 탭 + 더보기로 같은 목적지를 연다.

| 탭 | 웹 대응 | 내용 |
|---|---|---|
| **홈** | `/` | 타임라인, 고정, 태그 필터(상단 칩/시트), 검색 |
| **탐색** | `/explore` | 공개 메모 |
| **수신함** | `/inbox` | 댓글·멘션. 뱃지 |
| **나** | 프로필+설정 묶음 | 아래 스택 |

**홈 오른쪽 아래 FAB** = 웹 작성기. 탭이 아님.

**나** 안의 리스트 (웹과 1:1):

1. 프로필 `/u/:me` (히트맵, 지도, 내 메모)
2. 첨부 `/attachments`
3. 뷰 `/views`
4. 보관 `/archived`
5. 설정 `/setting` (섹션 목록)
6. 계정 전환 / 서버 연결
7. 정보 `/about`

설정 섹션 (웹 `settingSections.ts` 그대로):

- 사용자: 내 계정, 액세스 토큰, 환경설정, 웹훅, 태그
- 관리자만: 멤버, 시스템, 메모, 스토리지, 알림, SSO, AI, 리소스 통계

### iPad / 가로 — 웹과 동일 3열

`NavigationSplitView`

- 리드: 웹 `AppSidebar` — 홈, 탐색, 수신함, 첨부, 뷰, 보관, 태그 트리, 통계 캘린더
- 센터: 현재 리스트
- 트레일(상세 시): 웹 `MemoDetailSidebar` — 아웃라인, 공유, 메타

### 작성기 · 상세 (모달/푸시)

- 작성: 큰 시트 (웹 MemoEditor 전체)
- 상세: 푸시 + 댓글/리액션/관계/위치/첨부
- 공유 링크: `/memos/shares/:token`
- 검색: 홈에서 시트로 (웹 Quick Find)

---

## 3. 디자인 · 스타일

웹 `web/src/themes/COLOR_GUIDE.md` OKLCH 토큰을 **Asset Catalog + SwiftUI `ShapeStyle`** 로 옮긴다. 웹 CSS를 런타임에 읽지 않는다.

| 토큰 | 역할 | iOS |
|---|---|---|
| `--primary` | 골든 옐로 CTA, 활성 탭 | `Color.brand` |
| `--background` / `--card` | 페이지·카드 | `Color.bg` / `Color.card` |
| `--foreground` / `--muted-foreground` | 본문·보조 | label / secondaryLabel에 매핑하지 말고 웹 값을 복제 |
| `--popover` | 시트·드롭다운 | 시트 배경 |
| 다크 | `default-dark.css` | `.colorScheme(.dark)` 자동 |
| paper 테마 | `paper.css` | 설정에서 3번째 테마 |

타이포: 웹과 같이 **본문은 가독 세리프 없음(산세리프)**, 코드는 고정폭. Dynamic Type 적용. 카드 라운드·그림자는 웹 카드(`rounded-xl`, 약한 보더)를 따른다.

컴포넌트 톤:

- 리스트: 웹 다열 그리드 → 폰 1열, 아이패드 2–3열 (`LazyVGrid`)
- 버튼: Primary = 골든, Secondary = muted
- 시트: `.presentationDetents` 작성기는 large
- 햅틱: 저장 성공 light, 삭제 warning
- SF Symbols를 웹 Lucide 자리에 둔다. 커스텀 아이콘은 최소화.

**하지 않을 것:** iOS 기본 그룹 인셋 리스트로 메모 카드를 바꿔 웹 느낌이 사라지는 것. 메모 카드는 커스텀 뷰.

---

## 4. 라이브러리 제안 (항목당 2–3 · 채택 굵게)

### 4.1 API / 네트워킹

| 안 | 패키지 | 평가 |
|---|---|---|
| **A 채택** | **[connect-swift](https://github.com/connectrpc/connect-swift)** | 서버가 Connect+proto. 생성 코드가 웹 TS와 같은 계약. JSON/binary. 인터셉터로 PAT 주입. |
| B | grpc-swift (Apple, WWDC 2026) | 순수 gRPC. 이 서버는 HTTP Connect가 본체. |
| C | Alamofire 6 + 손 Codable | 업로드 진행률은 좋음. proto 드리프트 남. |

첨부 업로드 진행률이 부족하면 Connect 위에 **Alamofire를 업로드 전용**으로만 추가.

### 4.2 Markdown 작성기 (품질 핵심)

| 안 | 패키지 | 평가 |
|---|---|---|
| **A 채택** | **웹과 동일 CodeMirror 6를 WKWebView 섬으로** (`web/src/components/MemoEditor/Editor` 재사용) | 태그 자동완성·장식 소스·툴바가 웹과 같아짐. “완벽한 포팅”에 유일하게 가깝다. 앱 나머지는 SwiftUI. |
| B | [Runestone](https://github.com/simonbs/Runestone) | 순수 네이티브, Tree-sitter. 손맛은 최고. 웹 Editor 기능(멘션 장식 등)은 직접 재구현. |
| C | TextKit 2 자체 | 의존 최소. 일정·버그 최대. |

채택 A. 네이티브 순수주의보다 **작성기 패리티**가 우선이다. 섬과 네이티브 사이는 `EditorController` 계약(웹과 같은 이름)으로 끊는다.

### 4.3 Markdown 렌더 (타임라인·상세)

| 안 | 패키지 | 평가 |
|---|---|---|
| **A 채택** | **[Textual](https://github.com/gonzalezreal/textual)** | MarkdownUI 후속. SwiftUI Text 파이프라인, 2026 활발. GFM. |
| B | [swift-markdown-ui](https://github.com/gonzalezreal/swift-markdown-ui) | 안정. 유지보수 모드. |
| C | Down / libcmark-gfm | 파서만. UI는 직접. |

코드블록 하이라이트는 Textual 테마 + **Splash** 또는 **Highlightr**.

### 4.4 수식 · 다이어그램 · 특수 블록

| 기능 | 안 | 채택 |
|---|---|---|
| KaTeX | iosMath / SwiftMath / KaTeX WKWebView | **iosMath**(네이티브) 1차, 복잡한 식만 KaTeX 웹뷰 |
| Mermaid | mermaid.js WKWebView / 서버 렌더 PNG | **mermaid.js 로컬 번들 웹뷰** (웹과 동일 문법) |
| 링크 카드 | 자체 Open Graph / LinkPresentation | **LinkPresentation** + 서버 `html_meta` API |
| 모션 포토 | 자체 AVFoundation / MotionPhoto | 서버 `internal/motionphoto`와 맞춰 **AVFoundation** |

### 4.5 이미지 · 영상 · 오디오

| 안 | 패키지 | 평가 |
|---|---|---|
| **A 채택** | **[Nuke](https://github.com/kean/Nuke)** + NukeUI | 2026 메모리·프리패치 평가 좋음. Swift 우선. |
| B | Kingfisher | SwiftUI 예시 많음. 메모리 이슈 제보 있음. |
| C | SDWebImageSwiftUI | ObjC 코어. GIF는 강함. |

영상: **AVKit**. 음성 녹음: **AVAudioEngine** + 파형 자체. 웹 `useAudioRecorder`와 동작만 맞춤.  
사진 선택: **PhotosUI** (`PhotosPicker`) 1차, 다중·라이브포토 부족하면 **YPImagePicker**.

### 4.6 지도 · 위치

| 안 | 평가 |
|---|---|
| **A 채택 MapKit** | 네이티브, 오프라인 타일 정책 단순. |
| B Mapbox | 웹 Leaflet에 더 가깝지만 키·비용. |
| C Leaflet WKWebView | 웹과 동일, 손맛 떨어짐. |

역지오코딩: MapKit. 웹 `useReverseGeocoding`과 필드만 맞춤.

### 4.7 로컬 DB · 동기화

| 안 | 평가 |
|---|---|
| **A 채택 SwiftData** | iOS 18 기본. 위젯 공유 App Group 가능. |
| B GRDB | SQL 제어·성능. 학습 비용. |
| C Realm | Firebase와 겹치는 인상. 원본은 Memos라 비추. |

아웃박스 큐는 SwiftData 모델 `SyncOp`.

### 4.8 보안 저장 · DI · 토스트 · 날짜

| 역할 | 안1 | 안2 | 안3 | 채택 |
|---|---|---|---|---|
| 키체인 | **KeychainAccess** | Valet | SecItem 직접 | KeychainAccess |
| DI | **Factory** | Swinject | Needle | Factory (Swift 6 친화) |
| 토스트 | **AlertToast** | ToastUI | native `.toast` iOS 26 | AlertToast, 26이면 native 분기 |
| 상대시각 | **RelativeDateTimeFormatter** | SwiftDate | Timepiece | 네이티브 Formatter |
| 로깅 | **swift-log** + OSLog | CocoaLumberjack | SwiftyBeaver | swift-log |
| 네트워크 인디케이터 | native `.progress` | ActivityIndicatorView | SVProgressHUD | native |
| 키보드 툴바 | native `ToolbarItemGroup(.keyboard)` | KeyboardKit | IQKeyboardManager | native + KeyboardKit만 필요 시 |
| 햅틱 | native UIImpactFeedback | Haptica | - | native |

### 4.9 Firebase · 결제 · 품질

| 역할 | 채택 |
|---|---|
| 크래시 | **Firebase Crashlytics** |
| 분석 | **Firebase Analytics** (옵트인) |
| 푸시 | **Firebase Messaging** + APNs |
| 원격 설정 | **Firebase Remote Config** |
| 클라우드 로그인 | Firebase Auth Apple/Google (마일스톤 6) |
| 결제 | **StoreKit 2** (RevenueCat은 여유 되면 2안) |
| 테스트 | **swift-testing** + SnapshotTesting |

Firestore/Storage는 메모에 쓰지 않음.

### 4.10 채택 목록 (설치 대상)

1. connect-swift + 생성 플러그인  
2. CodeMirror 섬 (이 레포 Editor 번들)  
3. Textual  
4. Nuke / NukeUI  
5. KeychainAccess  
6. Factory  
7. AlertToast  
8. swift-log  
9. Firebase Crashlytics, Analytics, Messaging, RemoteConfig  
10. iosMath  
11. (선택) KeyboardKit, YPImagePicker, SnapshotTesting, Alamofire(업로드)

---

## 5. 화면 인벤토리 (누락 금지)

온보딩: 로컬 시작 / 서버 URL 연결.

인증: 로그인, 가입, 관리자 로그인, SSO 콜백.

메인: 홈, 탐색, 수신함, 나.

홈 부가: 검색, 태그 트리, 필터, 다열(아이패드).

작성기: 툴바, 삽입 메뉴, 공개범위, 위치, 음성, 포커스, 자동저장.

상세: 본문, 첨부, 위치, 관계, 댓글, 리액션, 아웃라인, 공유 이미지, 공유 링크.

나: 프로필, 첨부 라이브러리, 뷰, 보관, 설정 12섹션, about.

시스템: 404, 권한 없음, 서버 버전 미달.

---

## 6. 품질 게이트

마일스톤 1 종료 조건: **같은 메모를 웹 작성기와 앱 작성기에 붙여넣었을 때 저장 Markdown이 동일**하고, 타임라인 렌더가 태그·체크리스트·코드·이미지를 웹과 같이 보여 준다.

Moe Memos와 비교해서 “더 단순하다”면 실패다.
