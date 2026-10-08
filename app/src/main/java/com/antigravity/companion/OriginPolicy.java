package com.antigravity.companion;

import java.net.URI;
import java.net.URISyntaxException;

final class OriginPolicy {
    static final String REPAIR_URL = "https://appassets.androidplatform.net/assets/repair.html";
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
    boolean allowsNavigation(String url) { return REPAIR_URL.equals(url) || allowsBridge(url); }
}
