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
    @Test public void dashboardAndOriginsAreBounded() {
        OriginPolicy policy = new OriginPolicy(7681);
        assertTrue(policy.allowsNavigation(OriginPolicy.DASHBOARD_URL));
        assertTrue(policy.allowsNativePage(OriginPolicy.DASHBOARD_URL));
        assertTrue(policy.allowsNativePage("http://127.0.0.1:7681/chat"));
        assertFalse(policy.allowsNativePage(OriginPolicy.REPAIR_URL));
        assertTrue(policy.allowsNativeOrigin(OriginPolicy.ASSET_ORIGIN));
        assertTrue(policy.allowsNativeOrigin(policy.origin()));
        assertFalse(policy.allowsNativeOrigin(OriginPolicy.DASHBOARD_URL));
        assertFalse(policy.allowsNativeOrigin("https://user@appassets.androidplatform.net"));
        assertFalse(policy.allowsBridge(OriginPolicy.DASHBOARD_URL));
    }
    @Test public void packagedResourcesRejectTraversalAndOtherOrigins() {
        OriginPolicy policy = new OriginPolicy(7681);
        for (String url : new String[]{OriginPolicy.REPAIR_URL, OriginPolicy.DASHBOARD_URL,
                OriginPolicy.ASSET_ORIGIN + "/api.js?v=1#fragment",
                OriginPolicy.ASSET_ORIGIN + "/assets/web/start-ui.css"}) {
            assertTrue(url, policy.allowsAsset(url));
        }
        for (String url : new String[]{OriginPolicy.ASSET_ORIGIN + "/assets/secret.html",
                OriginPolicy.ASSET_ORIGIN + "/assets/web/../secret.js",
                OriginPolicy.ASSET_ORIGIN + "/assets/web/%2e%2e/secret.js",
                OriginPolicy.ASSET_ORIGIN + "/assets/web/%252e%252e/secret.js",
                OriginPolicy.ASSET_ORIGIN + "/assets/web/%2fsecret.js",
                OriginPolicy.ASSET_ORIGIN + "/run_tests.cjs",
                OriginPolicy.ASSET_ORIGIN + "/api/shutdown",
                "https://user@appassets.androidplatform.net/api.js",
                "https://appassets.androidplatform.net:444/api.js", "file:///api.js"}) {
            assertFalse(url, policy.allowsAsset(url));
        }
    }
}
