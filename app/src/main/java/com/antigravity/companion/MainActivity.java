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
import androidx.webkit.ScriptHandler;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Arrays;
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
import java.lang.ref.WeakReference;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends AppCompatActivity {
    private static WeakReference<MainActivity> activeActivity = new WeakReference<>(null);
    private WebView webView;
    private TextView status;
    private OriginPolicy origins;
    private AppUpdateManager updates;
    private ServerConnection server;
    private VoiceCapture voice;
    private Button accessibilityBanner;
    private ScriptHandler legacyScript;
    private boolean serverAvailable;
    private boolean legacyServer;
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
        buildViews(); configureWebView(); registerActions(); updateAccessibilityBanner();
        installBackHandler();
        webView.loadUrl(OriginPolicy.DASHBOARD_URL); probeServer(null, false);
    }
    private void buildViews() {
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        accessibilityBanner = new Button(this);
        accessibilityBanner.setText("خدمة الوصول غير مفعلة؛ افتح إعدادها");
        accessibilityBanner.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        panel.addView(accessibilityBanner);
        updateAccessibilityBanner();
        webView = new WebView(this); webView.setContentDescription("Antigravity Companion");
        panel.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(panel);
    }
    private void showStatus(String message) {
        status.setText(message);
        if (!destroyed && webView != null && origins.allowsNativePage(webView.getUrl()))
            webView.evaluateJavascript("(function(){const el=document.getElementById('live-announcer')"
                    + "||document.getElementById('sr-announcer');if(el)el.textContent="
                    + new com.google.gson.JsonPrimitive(message) + ";})();", null);
    }
    private void updateAccessibilityBanner() {
        if (!bridgeSupported) accessibilityBanner.setText("حدّث Android System WebView لتفعيل جسر التطبيق");
        else accessibilityBanner.setText("خدمة الوصول غير مفعلة؛ افتح إعدادها");
        accessibilityBanner.setVisibility(bridgeSupported && AntigravityAccessibilityService.isServiceRunning()
                ? android.view.View.GONE : android.view.View.VISIBLE);
    }
    @SuppressLint("SetJavaScriptEnabled") private void configureWebView() {
        WebSettings settings = webView.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/", path -> new WebViewAssetLoader.AssetsPathHandler(this).handle("web/" + path)).build();
        webView.setWebViewClient(new CompanionWebViewClient(this, origins, assets));
        bridgeSupported = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (!bridgeSupported) { showStatus("حدّث Android System WebView لتفعيل جسر التطبيق"); return; }
        WebViewCompat.addWebMessageListener(webView, "CompanionNative",
                new HashSet<>(Arrays.asList(origins.origin(), OriginPolicy.ASSET_ORIGIN)),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (isMainFrame && origins.allowsNativeOrigin(sourceOrigin.toString())
                            && origins.allowsNativePage(view.getUrl())) receiveNativeRequest(message.getData());
                });
        installLegacyBridge();
    }
    void openBrowser(Uri url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException unavailable) { showStatus("لا متصفح متاح لفتح الرابط"); }
    }
    void navigationStarted() { pageGeneration++; requestIds.clear(); serverConnected = false; voice.cancel(); }
    void navigationFinished() {
        reportVisibility();
        if (destroyed || !origins.allowsBridge(webView.getUrl())) return;
        webView.evaluateJavascript(legacyBridgeSource(), null);
        int generation = pageGeneration;
        connectionExecutor.execute(() -> {
            boolean authenticated;
            ServerConnection.Availability availability = server.probe();
            try { authenticated = availability == ServerConnection.Availability.MODERN && server.authenticServer(); }
            catch (IOException offline) { authenticated = false; }
            final boolean proved = authenticated;
            runOnUiThread(() -> {
                if (destroyed || generation != pageGeneration) return;
                serverAvailable = availability != ServerConnection.Availability.OFFLINE;
                legacyServer = availability == ServerConnection.Availability.LEGACY;
                serverConnected = proved;
                refreshLegacyState();
                if (proved) { BootReceiver.recovered(this); showStatus("الخادم متصل ومصادق"); deliverPendingVoice(); }
                else showStatus("جسر الهاتف غير مصادق؛ الاقتران اليدوي متاح للمحادثة فقط");
            });
        });
    }
    void serverConnectionLost() {
        serverConnected = false; serverAvailable = false; legacyServer = false;
        showStatus("تعذر الاتصال. أعد تشغيل الخادم."); webView.loadUrl(OriginPolicy.DASHBOARD_URL);
    }
    private void registerActions() {
        actions.put("get_app_version", request -> {
            JsonObject version = new JsonObject(); version.addProperty("version", updates.getCurrentVersionName());
            version.add("native_status", DoctorDiagnosticEngine.runDiagnosis(this));
            version.add("connection_status", connectionStatus());
            com.google.gson.JsonArray supported = new com.google.gson.JsonArray();
            for (String action : actions.keySet()) supported.add(action);
            version.add("native_actions", supported);
            version.addProperty("version_code", updates.currentVersionCode()); version.addProperty("can_install", updates.canInstallUnknownApps());
            reply(request, version);
        });
        actions.put("get_connection_status", request -> reply(request, connectionStatus()));
        actions.put("run_diagnostics", request -> reply(request, DoctorDiagnosticEngine.runDiagnosis(this)));
        actions.put("is_accessibility_active", request -> reply(request,
                flag("active", AntigravityAccessibilityService.isServiceRunning())));
        actions.put("open_settings", request -> {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); reply(request, flag("opened", true));
        });
        actions.put("open_termux_app", request -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage(TermuxBridge.TERMUX_PACKAGE);
            if (launch == null) throw new IllegalStateException("Termux application is unavailable");
            startActivity(launch); reply(request, flag("opened", true));
        });
        actions.put("copy_setup_command", this::copySetupCommand);
        actions.put("check_update", request -> updates.checkForUpdates(outcome -> reply(request, outcome)));
        actions.put("download_update", this::downloadUpdate);
        actions.put("open_install_permission", request -> { updates.openInstallPermissionSettings(this); reply(request, flag("opened", true)); });
        actions.put("start_voice", request -> {
            voice.start(speech -> reply(request, speech));
        });
        actions.put("cancel_voice", request -> { voice.cancel(); reply(request, new JsonObject()); });
        actions.put("login_cli", request -> reply(request, TermuxBridge.startInteractive(this, "account", request.args.has("cwd") ? ScreenSnapshot.required(request.args, "cwd") : null)));
        actions.put("mcp_cli", request -> reply(request, TermuxBridge.startInteractive(this, "mcp", request.args.has("cwd") ? ScreenSnapshot.required(request.args, "cwd") : null)));
        actions.put("logout_cli", request -> reply(request, TermuxBridge.startInteractive(this, "logout", request.args.has("cwd") ? ScreenSnapshot.required(request.args, "cwd") : null)));
        actions.put("start_server", this::connectServer); actions.put("bootstrap", this::connectServer);
        actions.put("probe_server", request -> probeServer(request, false));
        actions.put("open_chat", request -> probeServer(request, true));
        actions.put("open_dashboard", request -> {
            reply(request, flag("opened", true)); webView.loadUrl(OriginPolicy.DASHBOARD_URL);
        });
        actions.put("stop_server", this::stopServer);
    }
    private JsonObject connectionStatus() {
        JsonObject connection = new JsonObject();
        connection.addProperty("server_connected", serverAvailable);
        connection.addProperty("server_available", serverAvailable);
        connection.addProperty("legacy", legacyServer);
        connection.addProperty("server_authenticated", serverConnected);
        connection.addProperty("connecting", connecting.get());
        connection.addProperty("automation_ready", AntigravityAccessibilityService.isAutomationServerReady());
        connection.addProperty("accessibility_active", AntigravityAccessibilityService.isServiceRunning());
        return connection;
    }
    private void copySetupCommand(NativeRequest request) {
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null) throw new IllegalStateException("Clipboard is unavailable");
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Antigravity Setup",
                "curl -fsSL https://raw.githubusercontent.com/ahanafy41/antigravity-companion/main/setup.sh | bash"));
        reply(request, flag("copied", true));
    }
    private static JsonObject flag(String name, boolean enabled) {
        JsonObject outcome = new JsonObject(); outcome.addProperty(name, enabled); return outcome;
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
            if (!origins.allowsNativePage(webView.getUrl()) || !NativeBridgePolicy.allows(actionName,
                    serverConnected, OriginPolicy.DASHBOARD_URL.equals(webView.getUrl())))
                throw new IllegalStateException("Native action needs an authenticated server page");
            NativeAction action = actions.get(actionName);
            if (action == null) throw new IllegalArgumentException("Unsupported native action");
            NativeActionArguments.validate(actionName, request.args);
            action.execute(request);
        } catch (JsonParseException | IllegalArgumentException | IllegalStateException | SecurityException | ActivityNotFoundException failure) {
            if (request != null) reply(request, error(failure.getMessage())); else showStatus("طلب Native مخالف: " + failure.getMessage());
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
        showStatus("فحص هوية الخادم");
        connectionExecutor.execute(() -> {
            try {
                ServerConnection.Availability availability = server.probe();
                if (availability == ServerConnection.Availability.OFFLINE) {
                    runOnUiThread(this::launchTermux);
                    long deadline = SystemClock.elapsedRealtime() + 30000;
                    while (!destroyed && SystemClock.elapsedRealtime() < deadline) {
                        adoptReportedServerPort();
                        availability = server.probe();
                        if (availability != ServerConnection.Availability.OFFLINE) break;
                        Thread.sleep(500);
                    }
                    if (destroyed) return;
                    if (availability == ServerConnection.Availability.OFFLINE)
                        throw new IOException("Server health check timed out; setup in Termux may be required");
                }
                if (availability == ServerConnection.Availability.LEGACY) {
                    runOnUiThread(() -> {
                        if (destroyed || request != null && request.generation != pageGeneration) return;
                        serverAvailable = true; legacyServer = true; serverConnected = false;
                        refreshLegacyState();
                        JsonObject ready = connectionStatus(); ready.addProperty("state", "health_ready");
                        if (request != null) reply(request, ready);
                    });
                } else if (availability == ServerConnection.Availability.MODERN) authenticateServer(request);
                else throw new IOException("Server became unavailable");
            } catch (IOException | InterruptedException failure) {
                if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
                runOnUiThread(() -> { if (!destroyed) { showStatus("تعذر اتصال الخادم: " + connectionFailureReason(failure.getMessage())); if (request != null) reply(request, error(failure.getMessage())); } });
            } finally { connecting.set(false); }
        });
    }
    private void probeServer(NativeRequest request, boolean openChat) {
        connectionExecutor.execute(() -> {
            ServerConnection.Availability availability = server.probe();
            boolean authenticated = false;
            if (availability == ServerConnection.Availability.MODERN) {
                try { authenticated = server.authenticServer(); } catch (IOException offline) { /* Display remains available. */ }
            }
            final boolean proved = authenticated;
            runOnUiThread(() -> {
                if (destroyed || request != null && request.generation != pageGeneration) return;
                serverAvailable = availability != ServerConnection.Availability.OFFLINE;
                legacyServer = availability == ServerConnection.Availability.LEGACY; serverConnected = proved;
                refreshLegacyState();
                if (openChat && !serverAvailable) {
                    reply(request, error("Server unavailable; start it from the dashboard")); return;
                }
                if (request != null) reply(request, connectionStatus());
                if (openChat) { installLegacyBridge(); webView.loadUrl(origins.origin()); }
            });
        });
    }
    private void stopServer(NativeRequest request) {
        connectionExecutor.execute(() -> {
            try {
                ServerConnection.Availability availability = server.probe();
                if (availability == ServerConnection.Availability.LEGACY) server.stopLegacy();
                else if (availability == ServerConnection.Availability.MODERN) {
                    try (HeadlessVoiceApi api = new HeadlessVoiceApi(this)) {
                        api.request("POST", "/system/shutdown", new JsonObject());
                    }
                }
                runOnUiThread(() -> {
                    if (destroyed) return;
                    serverConnected = false; serverAvailable = false; legacyServer = false;
                    refreshLegacyState(); reply(request, flag("stopping", true));
                });
            } catch (IOException failure) {
                runOnUiThread(() -> { if (!destroyed) reply(request, error(failure.getMessage())); });
            }
        });
    }
    private JsonObject legacyState() {
        JsonObject state = connectionStatus(); state.addProperty("version", updates.getCurrentVersionName());
        state.addProperty("can_install", updates.canInstallUnknownApps()); return state;
    }
    private void refreshLegacyState() {
        if (!destroyed && webView != null && origins.allowsBridge(webView.getUrl()))
            webView.evaluateJavascript("window.CompanionLegacyState=" + legacyState() + ";", null);
    }
    private String legacyBridgeSource() {
        try (java.io.InputStream transport = getAssets().open("web/native.js");
                java.io.InputStream facade = getAssets().open("web/legacy-native.js")) {
            return "if(window.top===window){window.CompanionLegacyState=" + legacyState()
                    + ";if(!window.Companion||!window.Companion.native){"
                    + readAsset(transport) + "}"
                    + readAsset(facade) + "}";
        } catch (IOException missing) { showStatus("تعذر تحميل جسر التوافق"); return ""; }
    }
    private static String readAsset(java.io.InputStream input) throws IOException {
        java.io.ByteArrayOutputStream content = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[4096]; int count;
        while ((count = input.read(buffer)) != -1) content.write(buffer, 0, count);
        return new String(content.toByteArray(), StandardCharsets.UTF_8);
    }
    private void installLegacyBridge() {
        if (legacyScript != null) { legacyScript.remove(); legacyScript = null; }
        if (bridgeSupported && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            legacyScript = WebViewCompat.addDocumentStartJavaScript(webView, legacyBridgeSource(), Collections.singleton(origins.origin()));
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
            serverConnected = false; showStatus("اقترن يدويًا بالخادم؛ جسر الهاتف غير مصادق. " + connectionFailureReason(reason));
            if (request != null) reply(request, error("Manual pairing required; phone bridge is not authenticated"));
            serverAvailable = true; legacyServer = false; refreshLegacyState();
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
                if (!destroyed) showStatus((serverConnected ? "الخادم متصل؛ " : "")
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
        if (destroyed || request != null && request.generation != pageGeneration) return;
        CookieManager.getInstance().setCookie(origins.origin(), cookie, accepted -> {
            if (destroyed || request != null && request.generation != pageGeneration) return;
            if (!accepted) { showStatus("تعذر حفظ جلسة الخادم"); if (request != null) reply(request, error("Session cookie rejected")); return; }
            CookieManager.getInstance().flush();
            serverAvailable = true; legacyServer = false; serverConnected = true;
            refreshLegacyState();
            showStatus("الخادم متصل");
            JsonObject ready = new JsonObject(); ready.addProperty("state", "health_ready"); if (request != null) reply(request, ready);
            deliverPendingVoice();
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
            if (!destroyed && generation == pageGeneration && origins.allowsNativePage(webView.getUrl()))
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
        if (!origins.allowsNativePage(webView.getUrl())) { leaveActivity(callback); return; }
        int generation = pageGeneration;
        webView.evaluateJavascript(
                "Boolean(window.Companion && window.Companion.ui && window.Companion.ui.dismissTopDialog && window.Companion.ui.dismissTopDialog())",
                dismissed -> {
                    if (destroyed || generation != pageGeneration) return;
                    if (!"true".equals(dismissed)) {
                        if (origins.allowsBridge(webView.getUrl())) webView.loadUrl(OriginPolicy.DASHBOARD_URL);
                        else leaveActivity(callback);
                    }
                });
    }
    private void leaveActivity(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        try { getOnBackPressedDispatcher().onBackPressed(); }
        finally { callback.setEnabled(true); }
    }
    private void acceptVoice(JsonObject speech) {
        if (speech.has("error")) { showStatus(speech.get("error").getAsString()); return; }
        getIntent().putExtra("voice_agent", false);
        getIntent().putExtra("voice_text", speech.get("text").getAsString());
        getIntent().putExtra("voice_task_id", speech.get("task_id").getAsString()); deliverPendingVoice();
    }
    private boolean isChatPage() {
        if (!origins.allowsBridge(webView.getUrl())) return false;
        String path = Uri.parse(webView.getUrl()).getPath();
        return path == null || path.isEmpty() || path.equals("/");
    }
    private void deliverPendingVoice() {
        String text = getIntent().getStringExtra("voice_text");
        if (text == null || !serverConnected || !isChatPage()) return;
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
    public static boolean deliverVoiceDictation(JsonObject speech) {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) return false;
        MainActivity activity = activeActivity.get();
        if (activity == null || activity.destroyed || !activity.serverConnected
                || !activity.isChatPage() || speech == null
                || speech.has("error") || !speech.has("text") || !speech.has("task_id")) return false;
        JsonObject dictation = speech.deepCopy(); dictation.addProperty("mode", "dictation");
        activity.emit("companion-voice-input", dictation, activity.pageGeneration); return true;
    }
    @Override protected void onStart() { super.onStart(); activeActivity = new WeakReference<>(this); }
    @Override protected void onStop() {
        if (activeActivity.get() == this) activeActivity.clear();
        super.onStop();
    }
    @Override protected void onResume() { super.onResume(); activityVisible = true; updateAccessibilityBanner(); reportVisibility(); refreshLegacyState(); }
    @Override protected void onPause() { activityVisible = false; reportVisibility(); super.onPause(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); deliverPendingVoice(); }
    private static JsonObject error(String message) { JsonObject failure = new JsonObject(); failure.addProperty("error", message); return failure; }
    @Override protected void onDestroy() {
        if (activeActivity.get() == this) activeActivity.clear();
        destroyed = true; TermuxBridge.cancelRequests(this); voice.close(); updates.close(); server.close(); connectionExecutor.shutdownNow();
        if (bridgeSupported) WebViewCompat.removeWebMessageListener(webView, "CompanionNative");
        if (legacyScript != null) legacyScript.remove();
        webView.stopLoading(); webView.setWebViewClient(new WebViewClient()); webView.destroy(); super.onDestroy();
    }
}
