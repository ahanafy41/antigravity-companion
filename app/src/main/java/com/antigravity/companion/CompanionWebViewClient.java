package com.antigravity.companion;

import android.graphics.Bitmap;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Collections;

final class CompanionWebViewClient extends WebViewClient {
    private final MainActivity activity;
    private final OriginPolicy origins;
    private final WebViewAssetLoader assets;
    CompanionWebViewClient(MainActivity activity, OriginPolicy origins, WebViewAssetLoader assets) {
        this.activity = activity; this.origins = origins; this.assets = assets;
    }
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (origins.allowsNavigation(request.getUrl().toString())) return false;
        if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) activity.openBrowser(request.getUrl());
        return true;
    }
    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (origins.allowsAsset(url)) {
            WebResourceResponse asset = assets.shouldInterceptRequest(request.getUrl());
            if (asset != null) return asset;
        }
        if (origins.allowsBridge(url)) return null;
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onPageStarted(WebView view, String url, Bitmap favicon) { activity.navigationStarted(); }
    @Override public void onPageFinished(WebView view, String url) { activity.navigationFinished(); }
    @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame() && origins.allowsBridge(request.getUrl().toString())) activity.serverConnectionLost();
    }
}
