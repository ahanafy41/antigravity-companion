package com.antigravity.companion;

import java.net.URI;
import java.net.URISyntaxException;

final class OriginPolicy {
    static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";
    static final String REPAIR_URL = ASSET_ORIGIN + "/assets/repair.html";
    static final String DASHBOARD_URL = ASSET_ORIGIN + "/assets/web/start.html";
    private final String origin;
    OriginPolicy(int port) {
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Invalid server port");
        origin = "http://127.0.0.1:" + port;
    }
    String origin() { return origin; }
    boolean allowsBridge(String url) {
        try {
            URI candidate = new URI(url);
            URI server = new URI(origin);
            return candidate.getUserInfo() == null && "http".equals(candidate.getScheme())
                    && "127.0.0.1".equals(candidate.getHost())
                    && candidate.getPort() == server.getPort();
        } catch (URISyntaxException | NullPointerException invalid) { return false; }
    }
    boolean allowsNativeOrigin(String url) {
        return origin.equals(url) || ASSET_ORIGIN.equals(url);
    }
    boolean allowsNativePage(String url) {
        return allowsBridge(url) || DASHBOARD_URL.equals(url);
    }
    boolean allowsNavigation(String url) {
        return REPAIR_URL.equals(url) || allowsNativePage(url);
    }
    boolean allowsAsset(String url) {
        if (REPAIR_URL.equals(url)) return true;
        try {
            URI candidate = new URI(url);
            if (!"https".equals(candidate.getScheme())
                    || !"appassets.androidplatform.net".equals(candidate.getHost())
                    || candidate.getUserInfo() != null || candidate.getPort() != -1) return false;
            String path = candidate.getRawPath();
            // Bundled names need no escapes; reject encoded traversal before decoding.
            if (path == null || path.isEmpty() || path.contains("%") || path.contains("\\")) return false;
            String relative = path.startsWith("/assets/web/")
                    ? path.substring("/assets/web/".length()) : path.substring(1);
            if (!relative.matches("[A-Za-z0-9_-]+\\.(?:js|css|svg|json|html|png|ico|woff2?)"))
                return false;
            return !relative.endsWith(".html") || relative.equals("start.html")
                    || relative.equals("index.html");
        } catch (URISyntaxException | NullPointerException invalid) {
            return false;
        }
    }
}
