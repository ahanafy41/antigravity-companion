package com.antigravity.companion;

import android.content.Context;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.text.TextUtils;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.logging.Logger;

/**
 * DoctorDiagnosticEngine: Comprehensive internal self-check returning structured JSON diagnostics.
 */
public class DoctorDiagnosticEngine {

    private static final Logger LOGGER = Logger.getLogger(DoctorDiagnosticEngine.class.getName());

    public static JsonObject runDiagnosis(Context context) {
        JsonObject report = new JsonObject();
        JsonArray checks = new JsonArray();
        int issuesCount = 0;

        // 1. Check Accessibility Service
        boolean a11yActive = isAccessibilityServiceEnabled(context);
        JsonObject a11yCheck = new JsonObject();
        a11yCheck.addProperty("check", "Accessibility Service Status");
        a11yCheck.addProperty("passed", a11yActive);
        if (!a11yActive) {
            issuesCount++;
            a11yCheck.addProperty("remediation", "افتح إعدادات إمكانية الوصول وقم بتفعيل Antigravity AI Automation.");
        }
        checks.add(a11yCheck);

        // 2. Check Termux Installation
        boolean termuxInstalled = isPackageInstalled(context, "com.termux");
        JsonObject termuxCheck = new JsonObject();
        termuxCheck.addProperty("check", "Termux Installation");
        termuxCheck.addProperty("passed", termuxInstalled);
        if (!termuxInstalled) {
            issuesCount++;
            termuxCheck.addProperty("remediation", "تطبيق Termux غير مثبت على هذا الهاتف.");
        }
        checks.add(termuxCheck);

        // 3. Check Termux RUN_COMMAND Permission
        boolean runCommandPerm = context.checkCallingOrSelfPermission("com.termux.permission.RUN_COMMAND") == PackageManager.PERMISSION_GRANTED;
        JsonObject permCheck = new JsonObject();
        permCheck.addProperty("check", "Termux RUN_COMMAND Permission");
        permCheck.addProperty("passed", runCommandPerm);
        if (!runCommandPerm) {
            issuesCount++;
            permCheck.addProperty("remediation", "إذن RUN_COMMAND غير ممنوح لتطبيق Antigravity. قم بمنحه عبر الإعدادات أو ADB.");
        }
        checks.add(permCheck);

        // 4. Check Port 8765 (Local Automation Server)
        boolean wsActive = TermuxBridge.isPortOpen("127.0.0.1", 8765, 300);
        JsonObject wsCheck = new JsonObject();
        wsCheck.addProperty("check", "WebSocket Bridge (Port 8765)");
        wsCheck.addProperty("passed", wsActive);
        if (!wsActive) {
            wsCheck.addProperty("remediation", "خادم WebSocket سيبدأ تلقائياً عند تفعيل خدمة إمكانية الوصول.");
        }
        checks.add(wsCheck);

        // 5. Check Port 7681 (Termux Python Server)
        boolean pyServerActive = TermuxBridge.isPortOpen("127.0.0.1", 7681, 400);
        JsonObject pyCheck = new JsonObject();
        pyCheck.addProperty("check", "Termux Python Server (Port 7681)");
        pyCheck.addProperty("passed", pyServerActive);
        if (!pyServerActive) {
            pyCheck.addProperty("remediation", "السيرفر غير نشط حالياً، ويتم تشغيله تلقائياً صامتاً عبر TermuxBridge.");
        }
        checks.add(pyCheck);

        report.addProperty("status", issuesCount == 0 ? "HEALTHY" : "NEEDS_ATTENTION");
        report.addProperty("issues_count", issuesCount);
        report.add("checks", checks);

        return report;
    }

    private static boolean isAccessibilityServiceEnabled(Context context) {
        if (AntigravityAccessibilityService.isServiceRunning()) {
            return true;
        }
        String expectedService = context.getPackageName() + "/" + AntigravityAccessibilityService.class.getName();
        String enabledServices = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (TextUtils.isEmpty(enabledServices)) return false;

        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabledServices);
        while (splitter.hasNext()) {
            if (expectedService.equalsIgnoreCase(splitter.next())) {
                return true;
            }
        }
        return false;
    }

    private static boolean isPackageInstalled(Context context, String packageName) {
        try {
            context.getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
