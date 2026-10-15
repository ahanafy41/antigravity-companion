package com.antigravity.companion;

import java.net.InetSocketAddress;
import org.junit.Test;
import static org.junit.Assert.*;

public class AutomationConnectionPolicyTest {
    private final OriginPolicy origins = new OriginPolicy(7681);

    @Test public void actualLoopbackPeerDoesNotNeedBearer() {
        assertTrue(AutomationConnectionPolicy.allows(new InetSocketAddress("127.0.0.1", 4000), "", origins));
        assertTrue(AutomationConnectionPolicy.allows(new InetSocketAddress("::1", 4000), origins.origin(), origins));
    }
    @Test public void absentUnresolvedAndRemotePeersCannotSpoofLoopback() {
        for (InetSocketAddress peer : new InetSocketAddress[]{null,
                InetSocketAddress.createUnresolved("localhost", 4000),
                new InetSocketAddress("192.0.2.1", 4000)}) {
            assertFalse(AutomationConnectionPolicy.allows(peer, origins.origin(), origins));
        }
    }
    @Test public void browserOriginMustMatchAuthenticatedServerOrigin() {
        for (String origin : new String[]{"https://attacker.invalid", "null", "http://127.0.0.1:7682",
                "http://localhost:7681", origins.origin() + "/path"}) {
            assertFalse(origin, AutomationConnectionPolicy.allows(new InetSocketAddress("127.0.0.1", 4000), origin, origins));
        }
    }
}
