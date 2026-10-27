package com.antigravity.companion;

import android.content.Context;
import android.content.pm.PackageManager;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public final class DoctorDiagnosticEngine {
    private DoctorDiagnosticEngine() { }
    public static JsonObject runDiagnosis(Context context, boolean serverAvailable) {
        boolean installed = termuxInstalled(context);
        boolean permission = context.checkSelfPermission("com.termux.permission.RUN_COMMAND") == PackageManager.PERMISSION_GRANTED;
        return assembleChecks(installed, permission, serverAvailable);
    }
    static JsonObject assembleChecks(boolean installed, boolean permission, boolean serverAvailable) {
        JsonArray checks = new JsonArray();
        checks.add(check("termux_installed", installed));
        checks.add(check("termux_run_command_permission", permission));
        checks.add(check("server_connectivity", serverAvailable));
        int issues = (installed ? 0 : 1) + (permission ? 0 : 1) + (serverAvailable ? 0 : 1);
        JsonObject diagnosis = new JsonObject(); diagnosis.add("checks", checks);
        diagnosis.addProperty("issues_count", issues); diagnosis.addProperty("status", issues == 0 ? "HEALTHY" : "NEEDS_ATTENTION");
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
