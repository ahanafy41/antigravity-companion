package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class OriginPolicyTest {
    @Test public void bridgeRejectsAlternateHostsPortsAndCredentials() {
        OriginPolicy policy = new OriginPolicy(7681);
        assertTrue(policy.allowsBridge("http://127.0.0.1:7681"));
        for (String url : new String[]{"http://localhost:7681", "http://127.0.0.1:7682",
                "https://127.0.0.1:7681", "http://user@127.0.0.1:7681", "file:///x"}) {
            assertFalse(url, policy.allowsBridge(url));
        }
    }
    @Test public void navigationAllowsOnlyServerAndExactRepairPage() {
        OriginPolicy policy = new OriginPolicy(7681);
        assertTrue(policy.allowsNavigation("http://127.0.0.1:7681/chat"));
        assertTrue(policy.allowsNavigation(OriginPolicy.REPAIR_URL));
        assertFalse(policy.allowsNavigation("https://appassets.androidplatform.net/assets/secret.html"));
    }
}
