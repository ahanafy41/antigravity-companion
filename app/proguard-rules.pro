# Keep WebSocket & Gson models
-keep class org.java_websocket.** { *; }
-keep class com.google.code.gson.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.antigravity.companion.** { *; }
