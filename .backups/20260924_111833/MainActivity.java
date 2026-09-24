package com.antigravity.companion;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.gson.JsonObject;

import java.util.logging.Logger;

/**
 * MainActivity: Accessible companion UI dashboard with integrated WebView.
 * Compliant with WCAG 2.2 AAA, TalkBack, and Jieshuo screen readers.
 */
public class MainActivity extends AppCompatActivity {

    private static final Logger LOGGER = Logger.getLogger(MainActivity.class.getName());

    private WebView mWebView;
    private LinearLayout mBannerA11y;
    private TextView mTvStatus;
    private Button mBtnEnableA11y;

    public static final String LOCAL_URL = "http://127.0.0.1:7681";
    public static final String FALLBACK_ASSET_URL = "file:///android_asset/web/index.html";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupViews();

        // 1. Silent check & auto-start of local Termux server
        TermuxBridge.ensureServerRunningAsync(this);

        // 2. Start WebSocket bridge if service already connected
        LocalAutomationServer.startServer();

        // 3. Load initial web dashboard
        loadInitialPage();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateAccessibilityBanner();
    }

    private void setupViews() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
        ));

        // Accessible Status Banner for Accessibility Service Status
        mBannerA11y = new LinearLayout(this);
        mBannerA11y.setOrientation(LinearLayout.HORIZONTAL);
        mBannerA11y.setPadding(32, 24, 32, 24);
        mBannerA11y.setBackgroundColor(0xFF2A2A2A);

        mTvStatus = new TextView(this);
        mTvStatus.setText(R.string.service_not_enabled);
        mTvStatus.setTextColor(0xFFFFFFFF);
        mTvStatus.setTextSize(14f);
        LinearLayout.LayoutParams tvParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        mBannerA11y.addView(mTvStatus, tvParams);

        mBtnEnableA11y = new Button(this);
        mBtnEnableA11y.setText(R.string.btn_enable_service);
        mBtnEnableA11y.setContentDescription(getString(R.string.btn_enable_service));
        mBtnEnableA11y.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAccessibilitySettings();
            }
        });
        mBannerA11y.addView(mBtnEnableA11y);

        root.addView(mBannerA11y);

        // Main Accessible WebView
        mWebView = new WebView(this);
        mWebView.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));
        configureWebView(mWebView);
        root.addView(mWebView);

        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);

        // Inject Native Bridge Object into JavaScript
        webView.addJavascriptInterface(new AntigravityJsBridge(), "AntigravityBridge");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()) || uri.toString().startsWith("file://")) {
                    return false;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
                return true;
            }
        });
    }

    private void loadInitialPage() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean serverReady = TermuxBridge.isPortOpen("127.0.0.1", 7681, 1000);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (serverReady) {
                            mWebView.loadUrl(LOCAL_URL);
                        } else {
                            mWebView.loadUrl(FALLBACK_ASSET_URL);
                        }
                    }
                });
            }
        }).start();
    }

    private void updateAccessibilityBanner() {
        boolean active = AntigravityAccessibilityService.isServiceRunning();
        mBannerA11y.setVisibility(active ? View.GONE : View.VISIBLE);
    }

    private void openAccessibilitySettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * JavaScript Bridge exposing native phone operations safely to the web client.
     */
    public class AntigravityJsBridge {

        @JavascriptInterface
        public boolean isAccessibilityActive() {
            return AntigravityAccessibilityService.isServiceRunning();
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openAccessibilitySettings();
                }
            });
        }

        @JavascriptInterface
        public void triggerServerWakeup() {
            TermuxBridge.ensureServerRunningAsync(MainActivity.this);
        }

        @JavascriptInterface
        public String runDiagnostics() {
            JsonObject diag = DoctorDiagnosticEngine.runDiagnosis(MainActivity.this);
            return diag.toString();
        }
    }
}
