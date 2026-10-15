package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeBridgePolicyTest {
    @Test public void localAndLegacyPagesExposeOnlyBoundedControls() {
        for (String action : new String[]{"get_app_version", "get_connection_status",
                "is_accessibility_active", "run_diagnostics", "start_server", "bootstrap",
                "probe_server", "stop_server", "open_chat", "open_dashboard", "open_settings",
                "open_termux_app", "copy_setup_command", "check_update", "download_update",
                "open_install_permission", "cancel_voice"}) {
            assertTrue(action, NativeBridgePolicy.allows(action, false, true));
            assertTrue(action, NativeBridgePolicy.allows(action, false, false));
        }
    }
    @Test public void advancedCommandsRequireAuthenticatedRemotePage() {
        for (String action : new String[]{"start_voice", "login_cli", "mcp_cli", "logout_cli"}) {
            assertFalse(action, NativeBridgePolicy.allows(action, false, false));
            assertFalse(action, NativeBridgePolicy.allows(action, true, true));
            assertTrue(action, NativeBridgePolicy.allows(action, true, false));
        }
        assertFalse(NativeBridgePolicy.allows("unknown_action", true, false));
        assertFalse(NativeBridgePolicy.allows(null, true, false));
    }
}
