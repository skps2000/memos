# Marklog — 디자인 / UI / UX 선정 기준

기능 라이브러리(`ios-libraries.ko.md`)와 별개다. 여기는 **보이는 것·만지는 것**만 정한다.

---

## 1. 원칙 (이 순서로만 고른다)

1. **1순위 레퍼런스 = 모바일 웹 Marklog/Memos**  
   폰 사파리로 `https://marklog.duckdns.org` 와 `http://localhost:3001` 을 연 화면.  
   카드, 작성기, 타임라인 밀도, 골든 옐로 CTA가 정답이다.

2. **2순위 = Apple HIG의 “크롬”만**  
   탭바, 시트, 키보드 회피, 뒤로가기, Dynamic Type, 세이프 에어리어.  
   메모 카드와 작성기를 iOS 설정 앱처럼 바꾸지 않는다.

3. **쓰지 않는 레퍼런스**  
   Moe Memos(축소판), 애플 메모(다른 제품), 아무 SwiftUI 키트(Look 이 바뀜).

4. **라이브러리는 “구멍만” 메운다**  
   SwiftUI로 웹과 같아 보이면 패키지를 안 넣는다.  
   전체 UI 키트(SwiftUIX로 화면을 채우기, Ionic, SwiftUI-shadcn 포트)는 채택하지 않는다.

5. **품질 판정**  
   같은 메모를 웹(폰)과 앱을 나란히 두고 스크롤·작성·저장이 어색하면 라이브러리 문제가 아니라 **레퍼런스를 잘못 따른 것**이다.

---

## 2. 레이어별로 무엇을 베끼나

| 레이어 | 출처 | iOS에서 |
|---|---|---|
| 색·의미 | `web/src/themes/COLOR_GUIDE.md` OKLCH | Asset Catalog 토큰 1:1 |
| 컴포넌트 규칙 | `web/src/components/ui/README.md` (variant/size, className 금지) | SwiftUI `ButtonStyle` / `Badge` 동명 variant |
| 작성 경험 | `MemoEditor` + CodeMirror 6 | **웹 Editor를 WKWebView 섬으로** |
| 본문 렌더 | `MemoContent` (GFM, 태그, 체크, 코드) | Textual + HighlighterSwift |
| 네비 | 웹 사이드바 → 폰 탭 4 + FAB | 시스템 `TabView` + 커스텀 FAB |
| 모션 | 웹 transition 정도 (과하지 않음) | SwiftUI + Pow는 **저장/삭제/고정만** |
| 아이콘 | 웹 Lucide | **SF Symbols** 매핑표. Lucide 폰트 패키지는 넣지 않음 (이질감) |

---

## 3. UI 프레임워크 선정

| 안 | 링크 | 결정 |
|---|---|---|
| **SwiftUI (채택)** | https://developer.apple.com/xcode/swiftui/ | 유일한 UI 프레임워크 |
| UIKit 전체 | — | 작성기 웹뷰, 맵, 영상만 UIKit |
| SwiftUIX | https://github.com/SwiftUIX/SwiftUIX | **탈락.** 키친싱크. Look이 우리 토큰을 이김 |
| Flutter / RN / Capacitor 전체 앱 | — | **탈락.** 네이티브 전제와 불일치. 작성기만 웹 |

크롬 보강만 허용:

| 역할 | 채택 | 링크 | 대안 |
|---|---|---|---|
| 시스템 뷰 미세조정 | **SwiftUI-Introspect** | https://github.com/siteline/swiftui-introspect | 탭바/네비 스크롤 엣지. 남용 금지 |
| 태그 줄바꿈 | **WrappingHStack** 또는 Layout 자체 | https://github.com/dkk/WrappingHStack | 웹 태그 칩 줄바꿈 |
| 전환·피드백 | **Pow** (저장 성공, 삭제, 고정) | https://github.com/EmergeTools/Pow · 미리보기 https://movingparts.io/pow | Lottie는 과함, 안 씀 |
| 상단 페이드 | 시스템 `safeAreaBar` / 자체 | https://github.com/nikstar/VariableBlur 는 필요할 때만 | iOS 26이면 시스템 우선 |

---

## 4. UX 레퍼런스를 어떻게 “눈으로” 고정하나

구현 전에 폰에서 웹을 캡처해 `marklog-ios/DesignRef/` 에 둔다. (아직 저장소 없음 — 착수 첫 커밋)

필수 캡처:

1. 홈 타임라인 (라이트/다크)
2. 작성기 포커스 + 키보드 + 툴바
3. 메모 상세 (댓글·리액션)
4. 탐색, 수신함, 첨부
5. 설정 목록

리뷰할 때마다 **이 PNG와 시뮬레이터를 나란히** 본다. Dribbble/다른 앱 스크린샷으로 대체하지 않는다.

라이브 레퍼런스:

- https://marklog.duckdns.org (폰)
- http://localhost:3001 (개발)
- 토큰 문서 https://github.com/skps2000/memos/blob/main/web/src/themes/COLOR_GUIDE.md
- 키트 규칙 https://github.com/skps2000/memos/blob/main/web/src/components/ui/README.md

---

## 5. 한 줄 선정 결과

- **디자인 소스:** 이 제품의 모바일 웹.  
- **UI 프레임워크:** SwiftUI.  
- **작성 UX:** CodeMirror 섬 (라이브러리로 대체하지 않음).  
- **렌더 UX:** Textual.  
- **크롬 UX:** 시스템 Tab/Sheet + Introspect 최소.  
- **마이크로 인터랙션:** Pow 소수.  
- **아이콘:** SF Symbols ↔ Lucide 매핑.  
- **전체 UI 키트:** 없음.
