package com.antigravity.companion;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

final class NativeBridgePolicy {
    private static final Set<String> LOCAL_CONTROLS = new HashSet<>(Arrays.asList(
            "get_app_version", "get_connection_status",
            "run_diagnostics", "start_server", "bootstrap", "probe_server", "stop_server",
            "open_chat", "open_dashboard", "open_settings", "open_termux_app",
            "copy_setup_command", "check_update", "download_update", "open_install_permission"));
    private static final Set<String> AUTHENTICATED_CONTROLS = new HashSet<>(Arrays.asList(
            "login_cli", "mcp_cli", "logout_cli"));

    private NativeBridgePolicy() { }

    static boolean allows(String action, boolean authenticated, boolean localPage) {
        return LOCAL_CONTROLS.contains(action)
                || authenticated && !localPage && AUTHENTICATED_CONTROLS.contains(action);
    }
}
