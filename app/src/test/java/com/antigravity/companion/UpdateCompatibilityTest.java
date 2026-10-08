package com.antigravity.companion;

import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateCompatibilityTest {
    @Test public void apiV1AloneCannotAuthorizeInstaller() {
        JsonObject health = health("1.3.7");
        assertFalse(UpdateCompatibility.matches(health, "1.3.7"));
        health.addProperty("device_protocol", "journal_ready_epoch_v1");
        assertTrue(UpdateCompatibility.matches(health, "1.3.7"));
        assertFalse(UpdateCompatibility.matches(health, "1.3.6"));
        health.addProperty("device_protocol", "legacy");
        assertFalse(UpdateCompatibility.matches(health, "1.3.7"));
    }

    @Test public void malformedHealthCannotAuthorizeInstaller() {
        JsonObject health = health("1.3.7");
        health.addProperty("device_protocol", "journal_ready_epoch_v1");
        health.add("version", new JsonObject());
        assertFalse(UpdateCompatibility.matches(health, "1.3.7"));
        assertFalse(UpdateCompatibility.matches(new JsonObject(), "1.3.7"));
    }

    @Test public void embeddedReleaseMustMatchApkNameAndExactVersionCode() {
        JsonObject version = new JsonObject();
        version.addProperty("version_name", "1.3.7");
        version.addProperty("version_code", 13);
        assertTrue(UpdateCompatibility.embeddedVersionMatches(version, "1.3.7", 13));
        assertFalse(UpdateCompatibility.embeddedVersionMatches(version, "1.3.6", 13));
        assertFalse(UpdateCompatibility.embeddedVersionMatches(version, "1.3.7", 14));
        version.addProperty("version_code", 13.5);
        assertFalse(UpdateCompatibility.embeddedVersionMatches(version, "1.3.7", 13));
    }

    private static JsonObject health(String version) {
        JsonObject health = new JsonObject();
        health.addProperty("version", version);
        return health;
    }
}
