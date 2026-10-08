package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class SpeechActionPolicyTest {
    @Test public void speechEffectsAreJournaled() {
        for (String action : new String[]{"speak", "speech_cancel"}) {
            assertTrue(DeviceActionPolicy.supported(action));
            assertFalse(DeviceActionPolicy.isReadOnly(action));
        }
    }
}
