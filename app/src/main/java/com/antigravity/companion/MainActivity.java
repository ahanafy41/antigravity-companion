package com.antigravity.companion;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonParseException;
import java.io.File;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends AppCompatActivity {
    private WebView webView;
    private TextView status;
    private OriginPolicy origins;
    private AppUpdateManager updates;
    private ServerConnection server;
    private VoiceCapture voice;
    private Button voiceButton;
    private final ExecutorService connectionExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean connecting = new AtomicBoolean();
    private final Map<String, NativeAction> actions = new HashMap<>();
    private final NativeRequestLedger requestIds = new NativeRequestLedger();
    private int pageGeneration;
    private volatile boolean destroyed;
    private boolean bridgeSupported;
    private boolean serverConnected;
    private boolean activityVisible = true;
    private volatile String lastTermuxFailure = "";
    private volatile int reportedServerPort;
    private interface NativeAction { void execute(NativeRequest request); }
    private static final class NativeRequest {
        final String id;
        final JsonObject args;
        final int generation;
        NativeRequest(String id, JsonObject args, int generation) { this.id = id; this.args = args; this.generation = generation; }
    }
    @Override protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        origins = new OriginPolicy(NativeSecrets.serverPort(this));
        updates = new AppUpdateManager(this); server = new ServerConnection(this); voice = new VoiceCapture(this);
        buildViews(); configureWebView(); registerActions();
        installBackHandler();
        webView.loadUrl(OriginPolicy.REPAIR_URL); connectServer(null);
    }
    private void buildViews() {
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this); status.setText(BootReceiver.restartNeeded(this)
                ? "استعادة اتصال الخادم بعد إعادة تشغيل الهاتف" : "فحص الاتصال بالخادم"); status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        panel.addView(status);
        Button restart = new Button(this); restart.setText("تشغيل الخادم");
        restart.setOnClickListener(view -> connectServer(null)); panel.addView(restart);
        Button accessibility = new Button(this); accessibility.setText("إعداد خدمة الوصول");
        accessibility.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))); panel.addView(accessibility);
        voiceButton = new Button(this); voiceButton.setText("إملاء رسالة");
        voiceButton.setOnClickListener(view -> {
            if (voice.active()) { voice.cancel(); voiceButton.setText("إملاء رسالة"); return; }
            voiceButton.setText("إلغاء الإملاء");
            voice.start(speech -> { voiceButton.setText("إملاء رسالة"); acceptVoice(speech); });
        }); panel.addView(voiceButton);
        addVoicePreference(panel, "voice_sound", "صوت الإملاء", false);
        addVoicePreference(panel, "voice_vibration", "اهتزاز الإملاء", true);
        Button cancelDownload = new Button(this); cancelDownload.setText("إلغاء تنزيل الترقية");
        cancelDownload.setOnClickListener(view -> updates.cancelDownload()); panel.addView(cancelDownload);
        webView = new WebView(this); webView.setContentDescription("محادثة Antigravity");
        panel.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(panel);
    }
    private void addVoicePreference(LinearLayout panel, String key, String label, boolean initial) {
        android.content.SharedPreferences preferences = getSharedPreferences("companion_settings", MODE_PRIVATE);
        android.widget.CheckBox checkbox = new android.widget.CheckBox(this); checkbox.setText(label);
        checkbox.setChecked(preferences.getBoolean(key, initial));
        checkbox.setOnCheckedChangeListener((button, checked) -> preferences.edit().putBoolean(key, checked).apply());
        panel.addView(checkbox);
    }
    @SuppressLint("SetJavaScriptEnabled") private void configureWebView() {
        WebSettings settings = webView.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new CompanionWebViewClient(this, origins, assets));
        bridgeSupported = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (!bridgeSupported) { status.setText("حدّث Android System WebView لتفعيل جسر التطبيق"); return; }
        WebViewCompat.addWebMessageListener(webView, "CompanionNative", Collections.singleton(origins.origin()),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (isMainFrame && origins.allowsBridge(sourceOrigin.toString())) receiveNativeRequest(message.getData());
                });
    }
    void openBrowser(Uri url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException unavailable) { status.setText("لا متصفح متاح لفتح الرابط"); }
    }
    void navigationStarted() { pageGeneration++; requestIds.clear(); serverConnected = false; voice.cancel(); }
    void navigationFinished() {
        reportVisibility();
        if (destroyed || !origins.allowsBridge(webView.getUrl())) return;
        int generation = pageGeneration;
        connectionExecutor.execute(() -> {
            boolean authenticated;
            try { authenticated = server.authenticServer(); } catch (IOException offline) { authenticated = false; }
            final boolean proved = authenticated;
            runOnUiThread(() -> {
                if (destroyed || generation != pageGeneration) return;
                serverConnected = proved;
                if (proved) { BootReceiver.recovered(this); status.setText("الخادم متصل ومصادق"); deliverPendingVoice(); }
                else status.setText("جسر الهاتف غير مصادق؛ الاقتران اليدوي متاح للمحادثة فقط");
            });
        });
    }
    void serverConnectionLost() {
        serverConnected = false; status.setText("تعذر الاتصال. أعد تشغيل الخادم."); webView.loadUrl(OriginPolicy.REPAIR_URL);
    }
    private void registerActions() {
        actions.put("get_app_version", request -> {
            JsonObject version = new JsonObject(); version.addProperty("version", updates.getCurrentVersionName());
            version.add("native_status", DoctorDiagnosticEngine.runDiagnosis(this));
            version.addProperty("version_code", updates.currentVersionCode()); version.addProperty("can_install", updates.canInstallUnknownApps());
            reply(request, version);
        });
        actions.put("check_update", request -> updates.checkForUpdates(outcome -> reply(request, outcome)));
        actions.put("download_update", this::downloadUpdate);
        actions.put("open_install_permission", request -> { updates.openInstallPermissionSettings(this); reply(request, new JsonObject()); });
        actions.put("start_voice", request -> {
            voiceButton.setText("إلغاء الإملاء");
            voice.start(speech -> { voiceButton.setText("إملاء رسالة"); reply(request, speech); });
        });
        actions.put("cancel_voice", request -> { voice.cancel(); reply(request, new JsonObject()); });
        actions.put("login_cli", request -> reply(request, TermuxBridge.startInteractive(this, "account", request.args.has("cwd") ? ScreenSnapshot.required(request.args, "cwd") : null)));
        actions.put("mcp_cli", request -> reply(request, TermuxBridge.startInteractive(this, "mcp", request.args.has("cwd") ? ScreenSnapshot.required(request.args, "cwd") : null)));
        actions.put("start_server", this::connectServer); actions.put("bootstrap", this::connectServer);
    }
    private void receiveNativeRequest(String message) {
        NativeRequest request = null;
        try {
            if (message == null || message.length() > 65536) throw new IllegalArgumentException("Native request too large");
            com.google.gson.JsonElement root = JsonParser.parseString(message);
            if (!root.isJsonObject()) throw new IllegalArgumentException("Native request must be an object");
            JsonObject payload = root.getAsJsonObject();
            String id = ScreenSnapshot.required(payload, "request_id");
            if (!id.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException("Invalid request_id");
            if (!payload.has("args") || !payload.get("args").isJsonObject()) throw new IllegalArgumentException("Missing args");
            requestIds.reserve(id);
            request = new NativeRequest(id, payload.getAsJsonObject("args"), pageGeneration);
            String actionName = ScreenSnapshot.required(payload, "action");
            if (!serverConnected && !actionName.equals("get_app_version") && !actionName.equals("start_server")
                    && !actionName.equals("bootstrap")) throw new IllegalStateException("Native actions need an authenticated server");
            NativeAction action = actions.get(actionName);
            if (action == null) throw new IllegalArgumentException("Unsupported native action");
            action.execute(request);
        } catch (JsonParseException | IllegalArgumentException | IllegalStateException | SecurityException failure) {
            if (request != null) reply(request, error(failure.getMessage())); else status.setText("طلب Native مخالف: " + failure.getMessage());
        }
    }
    private void downloadUpdate(NativeRequest request) {
        if (request.args.has("cancel") && (!request.args.get("cancel").isJsonPrimitive()
                || !request.args.get("cancel").getAsJsonPrimitive().isBoolean())) throw new IllegalArgumentException("cancel must be boolean");
        if (request.args.has("cancel") && request.args.get("cancel").getAsBoolean()) {
            updates.cancelDownload(); reply(request, new JsonObject()); return;
        }
        updates.download(new AppUpdateManager.DownloadListener() {
            @Override public void progress(int percent, long bytes, long total) {
                JsonObject progress = new JsonObject(); progress.addProperty("request_id", request.id);
                progress.addProperty("percent", percent); progress.addProperty("bytes_downloaded", bytes); progress.addProperty("total_bytes", total);
                emit("companion-native-progress", progress, request.generation);
            }
            @Override public void downloaded(File apk) {
                JsonObject outcome = new JsonObject(); outcome.addProperty("downloaded", true);
                boolean canInstall = updates.canInstallUnknownApps(); outcome.addProperty("install_permission_required", !canInstall);
                if (!canInstall) { outcome.addProperty("installer_opened", false); reply(request, outcome); return; }
                updates.installVerifiedApk(MainActivity.this, apk, server, installed -> {
                    if (installed.has("error")) { reply(request, installed); return; }
                    outcome.addProperty("installer_opened", installed.get("installer_opened").getAsBoolean());
                    reply(request, outcome);
                });
            }
            @Override public void failed(String failure) { reply(request, error(failure)); }
        });
    }
    private void connectServer(NativeRequest request) {
        if (!connecting.compareAndSet(false, true)) { if (request != null) reply(request, error("Server connection already pending")); return; }
        lastTermuxFailure = "";
        status.setText("فحص هوية الخادم");
        connectionExecutor.execute(() -> {
            try {
                if (!server.healthReady()) {
                    runOnUiThread(this::launchTermux);
                    long deadline = SystemClock.elapsedRealtime() + 30000;
                    while (!destroyed && SystemClock.elapsedRealtime() < deadline) {
                        adoptReportedServerPort();
                        if (server.healthReady()) break;
                        Thread.sleep(500);
                    }
                    if (destroyed) return;
                    if (!server.healthReady()) throw new IOException("Server health check timed out; setup in Termux may be required");
                }
                authenticateServer(request);
            } catch (IOException | InterruptedException failure) {
                if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
                runOnUiThread(() -> { if (!destroyed) { status.setText("تعذر اتصال الخادم: " + connectionFailureReason(failure.getMessage())); if (request != null) reply(request, error(failure.getMessage())); } });
            } finally { connecting.set(false); }
        });
    }
    private void authenticateServer(NativeRequest request) throws IOException, InterruptedException {
        try {
            String cookie = server.bootstrapCookie(); runOnUiThread(() -> serverReady(request, cookie));
        } catch (ServerConnection.BootstrapUnauthorized unavailable) {
            if (!configureRunningServer()) { manualPairing(request, unavailable.getMessage()); return; }
            try {
                String cookie = server.bootstrapCookie(); runOnUiThread(() -> serverReady(request, cookie));
            } catch (ServerConnection.BootstrapUnauthorized stillUnpaired) { manualPairing(request, stillUnpaired.getMessage()); }
        }
    }
    private boolean configureRunningServer() throws InterruptedException, IOException {
        java.util.concurrent.CountDownLatch finished = new java.util.concurrent.CountDownLatch(1);
        AtomicBoolean configured = new AtomicBoolean();
        runOnUiThread(() -> {
            if (destroyed || checkSelfPermission("com.termux.permission.RUN_COMMAND") != PackageManager.PERMISSION_GRANTED) {
                finished.countDown(); return;
            }
            TermuxBridge.startServer(this, launch -> {
                rememberTermuxFailure(launch);
                String state = launch.get("state").getAsString();
                if (state.equals("accepted")) return;
                configured.set(state.equals("finished")); finished.countDown();
            });
        });
        boolean ready = finished.await(32, java.util.concurrent.TimeUnit.SECONDS) && configured.get() && !destroyed;
        if (ready) adoptReportedServerPort();
        return ready;
    }
    private void manualPairing(NativeRequest request, String reason) {
        runOnUiThread(() -> {
            if (destroyed) return;
            serverConnected = false; status.setText("اقترن يدويًا بالخادم؛ جسر الهاتف غير مصادق. " + connectionFailureReason(reason));
            if (request != null) reply(request, error("Manual pairing required; phone bridge is not authenticated"));
            if (!origins.allowsBridge(webView.getUrl())) webView.loadUrl(origins.origin());
        });
    }
    private void launchTermux() {
        if (destroyed) return;
        if (checkSelfPermission("com.termux.permission.RUN_COMMAND") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"com.termux.permission.RUN_COMMAND"}, 2001); return;
        }
        TermuxBridge.startServer(this, launch -> {
            rememberTermuxFailure(launch);
            runOnUiThread(() -> {
                if (!destroyed) status.setText((serverConnected ? "الخادم متصل؛ " : "")
                        + TermuxLaunchContract.summary(launch));
            });
        });
    }
    private void rememberTermuxFailure(JsonObject launch) {
        String state = launch.get("state").getAsString();
        if (state.equals("failed") || state.equals("outcome_unknown")) {
            lastTermuxFailure = TermuxLaunchContract.summary(launch);
        } else if (state.equals("finished")) {
            lastTermuxFailure = "";
            if (launch.has("server_port")) reportedServerPort = launch.get("server_port").getAsInt();
        }
    }
    private void adoptReportedServerPort() throws IOException {
        int port = reportedServerPort;
        if (port == 0 || port == NativeSecrets.serverPort(this) || destroyed) return;
        ServerConnection candidate = new ServerConnection(this, port);
        boolean adopted = false;
        try {
            if (!candidate.authenticServer() || destroyed) return;
            NativeSecrets.saveServerPort(this, port);
            ServerConnection previous = server; server = candidate; adopted = true; previous.close();
            runOnUiThread(() -> {
                if (destroyed) return;
                origins = new OriginPolicy(port); serverConnected = false;
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
                    WebViewCompat.removeWebMessageListener(webView, "CompanionNative");
                configureWebView();
            });
        } finally { if (!adopted) candidate.close(); }
    }
    private String connectionFailureReason(String reason) {
        String diagnostic = lastTermuxFailure;
        return diagnostic.isEmpty() ? reason : reason + "; " + diagnostic;
    }
    private void serverReady(NativeRequest request, String cookie) {
        if (destroyed) return;
        CookieManager.getInstance().setCookie(origins.origin(), cookie, accepted -> {
            if (destroyed) return;
            if (!accepted) { status.setText("تعذر حفظ جلسة الخادم"); if (request != null) reply(request, error("Session cookie rejected")); return; }
            CookieManager.getInstance().flush();
            boolean reload = !serverConnected || !origins.allowsBridge(webView.getUrl());
            if (!reload) serverConnected = true;
            status.setText("الخادم متصل");
            JsonObject ready = new JsonObject(); ready.addProperty("state", "health_ready"); if (request != null) reply(request, ready);
            if (reload) webView.loadUrl(origins.origin());
        });
    }
    private void reply(NativeRequest request, JsonObject outcome) {
        if (request.generation != pageGeneration || !requestIds.complete(request.id)) return;
        JsonObject envelope = new JsonObject(); envelope.addProperty("request_id", request.id);
        envelope.addProperty("success", !outcome.has("error"));
        if (outcome.has("error")) envelope.add("error", outcome.get("error")); else envelope.add("result", outcome);
        emit("companion-native-result", envelope, request.generation);
    }
    private void emit(String event, JsonObject detail, int generation) {
        runOnUiThread(() -> {
            if (!destroyed && generation == pageGeneration && origins.allowsBridge(webView.getUrl()))
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + detail + "}));", null);
        });
    }
    private void installBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { dismissDialogOrLeave(this); }
        });
    }
    private void dismissDialogOrLeave(OnBackPressedCallback callback) {
        if (destroyed) return;
        if (!origins.allowsBridge(webView.getUrl())) { leaveActivity(callback); return; }
        int generation = pageGeneration;
        webView.evaluateJavascript(
                "Boolean(window.Companion && window.Companion.ui && window.Companion.ui.dismissTopDialog && window.Companion.ui.dismissTopDialog())",
                dismissed -> {
                    if (destroyed || generation != pageGeneration) return;
                    if (!"true".equals(dismissed)) leaveActivity(callback);
                });
    }
    private void leaveActivity(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        try { getOnBackPressedDispatcher().onBackPressed(); }
        finally { callback.setEnabled(true); }
    }
    private void acceptVoice(JsonObject speech) {
        if (speech.has("error")) { status.setText(speech.get("error").getAsString()); return; }
        getIntent().putExtra("voice_agent", false);
        getIntent().putExtra("voice_text", speech.get("text").getAsString());
        getIntent().putExtra("voice_task_id", speech.get("task_id").getAsString()); deliverPendingVoice();
    }
    private void deliverPendingVoice() {
        String text = getIntent().getStringExtra("voice_text");
        if (text == null || !serverConnected || !origins.allowsBridge(webView.getUrl())) return;
        JsonObject speech = new JsonObject(); speech.addProperty("text", text);
        speech.addProperty("task_id", getIntent().getStringExtra("voice_task_id"));
        speech.addProperty("mode", getIntent().getBooleanExtra("voice_agent", false) ? "agent" : "dictation");
        emit("companion-voice-input", speech, pageGeneration); getIntent().removeExtra("voice_text"); getIntent().removeExtra("voice_task_id"); getIntent().removeExtra("voice_agent");
    }
    private void reportVisibility() {
        if (destroyed || !serverConnected || !origins.allowsBridge(webView.getUrl())) return;
        JsonObject visibility = new JsonObject(); visibility.addProperty("visible", activityVisible);
        emit("companion-native-visibility", visibility, pageGeneration);
    }
    @Override protected void onResume() { super.onResume(); activityVisible = true; reportVisibility(); }
    @Override protected void onPause() { activityVisible = false; reportVisibility(); super.onPause(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); deliverPendingVoice(); }
    private static JsonObject error(String message) { JsonObject failure = new JsonObject(); failure.addProperty("error", message); return failure; }
    @Override protected void onDestroy() {
        destroyed = true; TermuxBridge.cancelRequests(this); voice.close(); updates.close(); server.close(); connectionExecutor.shutdownNow();
        if (bridgeSupported) WebViewCompat.removeWebMessageListener(webView, "CompanionNative");
        webView.stopLoading(); webView.setWebViewClient(new WebViewClient()); webView.destroy(); super.onDestroy();
    }
}
