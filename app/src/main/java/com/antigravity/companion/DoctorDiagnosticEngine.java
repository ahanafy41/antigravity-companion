package com.antigravity.companion;

import android.content.Context;
import android.content.pm.PackageManager;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public final class DoctorDiagnosticEngine {
    private DoctorDiagnosticEngine() { }
    public static JsonObject runDiagnosis(Context context) {
        JsonArray checks = new JsonArray();
        int issues = 0;
        boolean service = AntigravityAccessibilityService.isServiceRunning();
        checks.add(check("accessibility_connected", service)); if (!service) issues++;
        boolean installed = termuxInstalled(context);
        checks.add(check("termux_installed", installed)); if (!installed) issues++;
        boolean permission = context.checkSelfPermission("com.termux.permission.RUN_COMMAND") == PackageManager.PERMISSION_GRANTED;
        checks.add(check("termux_run_command_permission", permission)); if (!permission) issues++;
        JsonObject diagnosis = new JsonObject(); diagnosis.add("checks", checks);
        diagnosis.addProperty("issues_count", issues); diagnosis.addProperty("status", issues == 0 ? "HEALTHY" : "NEEDS_ATTENTION");
        diagnosis.addProperty("server_health", "Check /health; package and permission checks do not prove server readiness");
        return diagnosis;
    }
    private static JsonObject check(String name, boolean passed) {
        JsonObject check = new JsonObject(); check.addProperty("check", name); check.addProperty("passed", passed); return check;
    }
    private static boolean termuxInstalled(Context context) {
        try { context.getPackageManager().getApplicationInfo("com.termux", 0); return true; }
        catch (PackageManager.NameNotFoundException missing) { return false; }
    }
}
