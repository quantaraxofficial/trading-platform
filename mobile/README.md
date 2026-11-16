# TradePilot phone apps (merge edition)

Built the way TradingView builds its own apps: **native apps** (Android in **Kotlin + Jetpack
Compose**, iOS in **Swift + SwiftUI**) with the **chart in a WebView** (Android System WebView /
WKWebView) running the site's own chart. TradingView's Android app draws its charts in the Android
System WebView too, and its iOS app is Swift (UIKit / SwiftUI).

| | Native | In the WebView (the merge site) |
|---|---|---|
| Watchlist | lists, sections, rows with live prices, add / remove, new list | prices and lists come from the chart page |
| Symbol search | search box, recent, popular | results from the site's `/api/symbol-search` |
| Symbol page | price, change, range chart (1D…All), Chart / Trade, key stats | the bars come from the chart page |
| Chart | the bar under it: symbol, timeframe, drawing tools, indicators, more, undo / redo | the chart itself, in the site's app mode |
| Explore / Menu | feature cards, account, theme, PC address, guide | analytics, leaderboard, reels, plans, Q&A, community, sign-in pages |

The two sides talk through a small bridge: `src/app/lib/appBridge.ts` + `src/app/components/AppBridge.tsx`
on the site, `bridge/Bridge.kt` (Android) and `Bridge.swift` (iOS) in the apps.

## Connecting to the PC

The merge branch runs on your PC, so the phone reaches it over your Wi-Fi:

1. Open the merge desktop app (TradePilot), Menu → Settings → **Phone app** → turn on
   **Use TradePilot on your phone**, then restart it. Windows asks once whether to allow it on the
   network: choose **Private networks**.
2. Settings shows the PC's address (e.g. `192.168.0.104`). Enter it in the phone app on first run.

With phone access on, the backend and site listen on the network (not just this PC) and the backend
accepts the PC's network address. The site calls its backend at `http://localhost:8000`; the apps
point those calls at the PC before the page's scripts run.

Signing in: email and password work in the app. Google's sign-in refuses to run inside apps'
WebViews (Google's rule), so use email sign-in on the phone.

## Android

Needs JDK 17 and the Android SDK (`local.properties`: `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`).

```
cd mobile/android
set JAVA_HOME=G:\tools\jdk-17
gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
gradlew assembleRelease      # app/build/outputs/apk/release/app-release.apk (signed with the debug key for now)
```

Install on a phone: copy the APK to it and open it (allow installing from this source), or
`adb install app-debug.apk` with USB debugging on. The emulator reaches the PC at `10.0.2.2`.

## iOS

Needs a Mac with Xcode 15+ and [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```
cd mobile/ios
brew install xcodegen
xcodegen                     # makes TradePilot.xcodeproj
open TradePilot.xcodeproj    # pick your team under Signing, run on your iPhone
```
