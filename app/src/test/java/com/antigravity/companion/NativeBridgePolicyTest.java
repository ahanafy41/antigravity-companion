package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeBridgePolicyTest {
    @Test public void localAndLegacyPagesExposeOnlyBoundedControls() {
        for (String action : new String[]{"get_app_version", "get_connection_status",
                "run_diagnostics", "start_server", "bootstrap",
                "probe_server", "stop_server", "sync_server", "open_chat", "open_dashboard", "open_settings",
                "open_termux_app", "copy_setup_command", "check_update", "download_update",
                "open_install_permission"}) {
            assertTrue(action, NativeBridgePolicy.allows(action, false, true));
            assertTrue(action, NativeBridgePolicy.allows(action, false, false));
        }
    }
    @Test public void advancedCommandsRequireAuthenticatedRemotePage() {
        for (String action : new String[]{"login_cli", "mcp_cli", "logout_cli"}) {
            assertFalse(action, NativeBridgePolicy.allows(action, false, false));
            assertFalse(action, NativeBridgePolicy.allows(action, true, true));
            assertTrue(action, NativeBridgePolicy.allows(action, true, false));
        }
        for (String retired : new String[]{"is_accessibility_active", "start_voice", "cancel_voice",
                "speak", "stop_speech", "get_screen", "click_element", "device_action"})
            for (boolean authenticated : new boolean[]{false, true})
                for (boolean localPage : new boolean[]{false, true})
                    assertFalse(retired, NativeBridgePolicy.allows(retired, authenticated, localPage));
        assertFalse(NativeBridgePolicy.allows("unknown_action", true, false));
        assertFalse(NativeBridgePolicy.allows(null, true, false));
    }
}
