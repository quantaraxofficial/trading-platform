# The page calls these through the JavaScript bridge
-keepclassmembers class com.tradepilot.app.bridge.Bridge$JsPort {
    @android.webkit.JavascriptInterface <methods>;
}
