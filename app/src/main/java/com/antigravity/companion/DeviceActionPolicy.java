package com.antigravity.companion;

import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;

final class DeviceActionPolicy {
    private static final Set<String> READS = new HashSet<>(Arrays.asList("tree", "select", "screenshot"));
    private static final Set<String> EFFECTS = new HashSet<>(Arrays.asList(
            "click", "text", "scroll", "back", "home", "recents", "notifications", "launch_app"));

    static boolean isReadOnly(String action) { return READS.contains(action); }
    static boolean supported(String action) { return isReadOnly(action) || EFFECTS.contains(action); }
}
