package com.antigravity.companion;

import java.util.List;
import java.util.Locale;

final class AppLaunchTarget {
    static final class App {
        final String packageName;
        final String label;
        App(String packageName, String label) { this.packageName = packageName; this.label = label; }
    }

    static String resolve(String target, List<App> apps) {
        String normalized = normalize(target);
        if (normalized.isEmpty() || normalized.length() > 256)
            throw new IllegalArgumentException("Application target must contain 1 to 256 characters");
        for (int index = 0; index < target.length(); index++)
            if (Character.isISOControl(target.charAt(index)))
                throw new IllegalArgumentException("Application target contains control characters");
        String shortcut = shortcut(normalized);
        for (App app : apps)
            if (target.trim().equals(app.packageName) || app.packageName.equals(shortcut)) return app.packageName;
        String selected = null;
        for (App app : apps) {
            if (normalize(app.label).equals(normalized)) {
                if (selected != null && !selected.equals(app.packageName))
                    throw new IllegalArgumentException("Application name is ambiguous; use its package name");
                selected = app.packageName;
            }
        }
        if (selected == null) throw new IllegalArgumentException("No launchable application matches target");
        return selected;
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replace('أ', 'ا').replace('إ', 'ا');
    }

    private static String shortcut(String target) {
        switch (target) {
            case "whatsapp": case "واتساب": case "واتس": return "com.whatsapp";
            case "youtube": case "يوتيوب": return "com.google.android.youtube";
            case "chrome": case "كروم": return "com.android.chrome";
            case "telegram": case "تليجرام": return "org.telegram.messenger";
            case "settings": case "اعدادات": return "com.android.settings";
            case "termux": case "تيرمكس": case "تيرماكس": return "com.termux";
            default: return "";
        }
    }
}
