# Marklog iOS — 외부 라이브러리 검토표

전제: **Firebase Auth만.** 메모는 **SwiftData + (선택) iCloud/CloudKit.** Memos API·Turso·Firestore는 v1 없음.

아래 링크를 브라우저에서 직접 보면 된다. **채택**이 v1에 넣을 것.

---

## A. 공식 SDK · 애플 프레임워크 (SPM 아님)

직접 추가 패키지가 아니다. Xcode 프레임워크로 쓴다.

| 역할 | 이름 | 문서 |
|---|---|---|
| 로컬 DB | SwiftData | https://developer.apple.com/documentation/swiftdata |
| 기기간 동기화 | CloudKit (SwiftData 연동) | https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices |
| Sign in with Apple | AuthenticationServices | https://developer.apple.com/documentation/authenticationservices |
| 사진 선택 | PhotosUI | https://developer.apple.com/documentation/photosui |
| 영상 | AVKit | https://developer.apple.com/documentation/avkit |
| 녹음 | AVFoundation | https://developer.apple.com/documentation/avfoundation |
| 지도 | MapKit | https://developer.apple.com/documentation/mapkit |
| 링크 미리보기 | LinkPresentation | https://developer.apple.com/documentation/linkpresentation |
| 키체인 (직접도 가능) | Security | https://developer.apple.com/documentation/security |
| 상대 시각 | Foundation `RelativeDateTimeFormatter` | https://developer.apple.com/documentation/foundation/relativedatetimeformatter |
| 구독 (이후) | StoreKit 2 | https://developer.apple.com/documentation/storekit |

---

## B. v1 채택 (눈여겨볼 것)

| 역할 | 채택 | GitHub | 문서 / SPI | 왜 |
|---|---|---|---|---|
| 로그인 (Firebase) | Firebase Auth | https://github.com/firebase/firebase-ios-sdk | https://firebase.google.com/docs/auth/ios/start | Auth **모듈만** import. Analytics/Crashlytics/FCM 안 넣음 |
| 구글 로그인 | Google Sign-In | https://github.com/google/GoogleSignIn-iOS | https://developers.google.com/identity/sign-in/ios/start-integrating · https://swiftpackageindex.com/google/GoogleSignIn-iOS | Firebase 구글 공급자에 필요. **메모 복원 키는 아님** (iCloud가 Apple ID) |
| 메모 렌더 | **Textual** | https://github.com/gonzalezreal/textual | README 동 저장소 | MarkdownUI 후속. GFM, 수식, 이미지 |
| (대안 렌더) | swift-markdown-ui | https://github.com/gonzalezreal/swift-markdown-ui | https://swiftpackageindex.com/gonzalezreal/swift-markdown-ui | 유지보수 모드. Textual이 어리면 폴백 |
| 작성기 | **이 레포 CodeMirror 섬** | https://github.com/skps2000/memos/tree/main/web/src/components/MemoEditor/Editor | 웹과 동일 엔진 | WKWebView로 Editor만 임베드. 별도 SPM 아님 |
| (대안 작성기) | Runestone | https://github.com/simonbs/Runestone | https://runestone.app/ | 순수 네이티브. 웹 작성기와 손맛 다름 |
| 이미지 | **Nuke + NukeUI** | https://github.com/kean/Nuke | https://kean-docs.github.io/nuke/ · https://swiftpackageindex.com/kean/Nuke | 캐시·프리패치. 첨부 그리드 |
| (대안 이미지) | Kingfisher | https://github.com/onevcat/Kingfisher | https://swiftpackageindex.com/onevcat/Kingfisher | SwiftUI 예시 많음 |
| (대안 이미지) | SDWebImageSwiftUI | https://github.com/SDWebImage/SDWebImageSwiftUI | https://github.com/SDWebImage/SDWebImage | GIF 강함 |
| 키체인 | **KeychainAccess** | https://github.com/kishikawakatsumi/KeychainAccess | README | Firebase 세션·설정 토큰 |
| (대안 키체인) | Valet | https://github.com/square/Valet | README | Square 유지 |
| DI | **Factory** | https://github.com/hmlongco/Factory | https://hmlongco.github.io/Factory/ | Swift 6 친화 |
| (대안 DI) | Swinject | https://github.com/Swinject/Swinject | https://github.com/Swinject/Swinject/blob/master/Documentation/README.md | 오래됨, 무거움 |
| 토스트 | **AlertToast** | https://github.com/elai950/AlertToast | README | SwiftUI 토스트 |
| (대안 토스트) | ToastUI | https://github.com/quanshousio/ToastUI | README | |
| 코드 하이라이트 | **HighlighterSwift** | https://github.com/smittytone/HighlighterSwift | https://smittytone.net/highlighterswift/ | highlight.js 최신. Highlightr 후속 |
| (대안 하이라이트) | Splash | https://github.com/JohnSundell/Splash | README | Swift 중심, 언어 적음 |
| (대안 하이라이트) | HighlightSwift | https://github.com/appstefan/HighlightSwift | README | |

Firebase SPM URL (Xcode Add Package):

```
https://github.com/firebase/firebase-ios-sdk
```

제품에서 **FirebaseAuth** 만 체크. `FirebaseAnalytics` / `FirebaseCrashlytics` / `FirebaseMessaging` 끄기.

Google Sign-In SPM:

```
https://github.com/google/GoogleSignIn-iOS
```

---

## C. v1에서 넣지 않음 (나중에)

| 역할 | 패키지 | 링크 | 언제 |
|---|---|---|---|
| Memos API | connect-swift | https://github.com/connectrpc/connect-swift · https://buf.build/docs/connect/ | 셀프호스트 연결 마일스톤 |
| proto 생성 | buf | https://buf.build/docs/installation/ | 위와 함께 |
| 크래시 | Firebase Crashlytics | https://firebase.google.com/docs/crashlytics/ios/get-started | 출시 직전 선택 |
| 푸시 | Firebase Messaging | https://firebase.google.com/docs/cloud-messaging/ios/client | 알림 넣을 때 |
| 원격 설정 | Remote Config | https://firebase.google.com/docs/remote-config | 플래그 필요할 때 |
| 결제 | StoreKit 2 (공식) | https://developer.apple.com/documentation/storekit | 클라우드 구독 |
| (결제 대안) | RevenueCat | https://github.com/RevenueCat/purchases-ios | 구독 복잡할 때 |
| 클라우드 SQLite | libsql-swift / Turso | https://github.com/tursodatabase/libsql-swift · https://docs.turso.tech/sdk/swift/quickstart | 이번 전제와 안 맞음 |
| 키보드 확장 | KeyboardKit | https://github.com/KeyboardKit/KeyboardKit | 작성기 섬으로 부족할 때만 |
| 스냅샷 테스트 | swift-snapshot-testing | https://github.com/pointfreeco/swift-snapshot-testing | CI 할 때 |
| 단위 테스트 | swift-testing (공식) | https://developer.apple.com/xcode/swift-testing/ | 기본 |

---

## D. 작성기·수식·다이어그램 (웹 패리티용)

| 역할 | 채택 | 링크 | 비고 |
|---|---|---|---|
| Markdown 편집 엔진 | CodeMirror 6 (웹 코드) | https://codemirror.net/ · 이 레포 `web/src/components/MemoEditor/Editor` | 네이티브 패키지 아님. 번들로 넣음 |
| 수식 | iosMath | https://github.com/kostub/iosMath | Textual 수식이 약하면 |
| (수식 대안) | SwiftMath | https://github.com/mgriebling/SwiftMath | |
| Mermaid | mermaid.js | https://github.com/mermaid-js/mermaid · https://mermaid.js.org/ | 작은 WKWebView. 웹과 문법 동일 |
| KaTeX (폴백) | KaTeX | https://github.com/KaTeX/KaTeX | iosMath로 안 되는 식만 |

---

## E. 한눈에 보는 v1 SPM 목록

Xcode → File → Add Package Dependencies 에 넣을 URL만:

1. https://github.com/firebase/firebase-ios-sdk  
2. https://github.com/google/GoogleSignIn-iOS  
3. https://github.com/gonzalezreal/textual  
4. https://github.com/kean/Nuke  
5. https://github.com/kishikawakatsumi/KeychainAccess  
6. https://github.com/hmlongco/Factory  
7. https://github.com/elai950/AlertToast  
8. https://github.com/smittytone/HighlighterSwift  

작성기는 패키지가 아니라 **이 memos 저장소 Editor 폴더**를 앱 번들에 넣는다.

---

## F. 직접 볼 때 체크

각 GitHub에서 확인할 것:

- 마지막 커밋이 최근인지 (6개월 이상 멈췄으면 대안)
- License (MIT/Apache는 상용 OK. GPL은 피함)
- iOS 18 / Swift 6 이슈
- README 스크린샷이 SwiftUI인지 UIKit인지
