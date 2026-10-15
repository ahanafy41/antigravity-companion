package com.antigravity.companion;

import java.net.InetSocketAddress;

final class AutomationConnectionPolicy {
    private AutomationConnectionPolicy() { }

    static boolean allows(InetSocketAddress peer, String origin, OriginPolicy origins) {
        if (peer == null || peer.getAddress() == null || !peer.getAddress().isLoopbackAddress()) return false;
        return origin != null && (origin.isEmpty() || origin.equals(origins.origin()));
    }
}
