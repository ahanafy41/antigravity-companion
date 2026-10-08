package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class DeviceActionPolicyTest {
    @Test public void restoredActionsRemainJournaledEffects() {
        for (String action : new String[]{"home", "recents", "notifications", "launch_app"}) {
            assertTrue(action, DeviceActionPolicy.supported(action));
            assertFalse(action, DeviceActionPolicy.isReadOnly(action));
        }
        assertFalse(DeviceActionPolicy.supported("global_action"));
        assertFalse(DeviceActionPolicy.supported("shell"));
    }
}
