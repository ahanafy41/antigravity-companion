package com.antigravity.companion;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;
import static org.junit.Assert.*;

public class DeviceArgumentsTest {
    @Test public void pixelCoordinatesRejectMissingOrStaleOrImplicitUnits() {
        JsonObject valid = JsonParser.parseString("{\"units\":\"pixels\",\"width\":1080,\"height\":1920,\"x\":0,\"y\":1919}").getAsJsonObject();
        assertArrayEquals(new float[]{0, 1919}, DeviceArguments.coordinates(valid, 1080, 1920), 0f);
        for (String malformed : new String[]{"{}", "{\"units\":\"relative\"}",
                "{\"units\":\"pixels\",\"width\":1080,\"height\":1920,\"x\":1080,\"y\":0}",
                "{\"units\":\"pixels\",\"width\":1080,\"height\":1920,\"x\":\"0\",\"y\":0}"}) {
            try { DeviceArguments.coordinates(JsonParser.parseString(malformed).getAsJsonObject(), 1080, 1920); fail(malformed); }
            catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
        }
        try { DeviceArguments.coordinates(valid, 1920, 1080); fail("Stale dimensions accepted"); }
        catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
    }
}
