package com.antigravity.companion;

import com.google.gson.JsonObject;

final class UpdateCompatibility {
    static boolean embeddedVersionMatches(JsonObject version, String apkVersion, long apkCode) {
        if (!string(version, "version_name", apkVersion) || !version.has("version_code")
                || !version.get("version_code").isJsonPrimitive()
                || !version.get("version_code").getAsJsonPrimitive().isNumber()) return false;
        try { return version.get("version_code").getAsBigDecimal().longValueExact() == apkCode; }
        catch (ArithmeticException invalid) { return false; }
    }

    static boolean matches(JsonObject health, String apkVersion) {
        return string(health, "version", apkVersion)
                && string(health, "device_protocol", "journal_ready_epoch_v1");
    }

    private static boolean string(JsonObject data, String key, String expected) {
        return data.has(key) && data.get(key).isJsonPrimitive()
                && data.get(key).getAsJsonPrimitive().isString()
                && expected != null && expected.equals(data.get(key).getAsString());
    }
}
